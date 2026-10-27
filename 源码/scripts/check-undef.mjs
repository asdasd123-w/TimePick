#!/usr/bin/env node
/**
 * 静态扫描: 找出「被引用但从未声明」的标识符。
 *
 * 为什么需要它: `vite build` 只做模块打包, 遇到未定义标识符不会报错
 * (rollup 把它当成一个普通全局变量放行), 直到浏览器真正执行到那一行
 * 才抛 ReferenceError。若发生在 <script setup> 顶层, 组件 setup 直接失败,
 * 路由懒加载拿到 null, 父级 router-view 渲染时崩掉 -> 整页白屏。
 *
 * 用法: node scripts/check-undef.mjs [--json]
 * 退出码: 0 = 干净, 1 = 发现可疑未定义引用
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import { parse as parseSFC } from '@vue/compiler-sfc'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AS_JSON = process.argv.includes('--json')

// 语言/运行时/编译期宏 —— 这些没有显式声明也是合法的
const RUNTIME_GLOBALS = [
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'cancelIdleCallback', 'structuredClone',
  'fetch', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'Blob', 'File', 'FileReader', 'FormData',
  'Headers', 'Request', 'Response', 'WebSocket', 'BroadcastChannel',
  'MessageChannel', 'MessagePort', 'Worker', 'atob', 'btoa',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'escape', 'unescape',
  'Number', 'String', 'Boolean', 'Symbol', 'BigInt', 'Object', 'Array',
  'Function', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError',
  'JSON', 'Math', 'Reflect', 'Proxy', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Promise', 'Intl', 'globalThis', 'Infinity', 'NaN', 'undefined', 'arguments',
  'performance', 'crypto', 'Uint8Array', 'Int8Array', 'Uint16Array',
  'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'WeakRef', 'FinalizationRegistry',
  'ImageData', 'ImageBitmap', 'createImageBitmap', 'OffscreenCanvas',
  'DOMParser', 'XMLSerializer', 'Path2D', 'Path2D',
  // Vue 编译期宏
  'defineProps', 'defineEmits', 'defineExpose', 'defineOptions',
  'defineSlots', 'defineModel', 'withDefaults', 'useSlotsWhitelistPlaceholder',
]

const BROWSER_GLOBALS = [
  'window', 'document', 'location', 'history', 'screen', 'self', 'top',
  'parent', 'frames', 'navigator', 'localStorage', 'sessionStorage',
  'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'Notification', 'Image', 'Audio', 'Event', 'CustomEvent', 'EventTarget',
  'HTMLElement', 'Node', 'Element', 'Document', 'NodeList', 'CSS',
  'indexedDB', 'caches', 'devicePixelRatio', 'innerWidth', 'innerHeight',
  'scrollTo', 'scrollBy', 'getSelection', 'open', 'close', 'postMessage',
  'DOMPoint', 'DOMRect', 'getSelection', 'print',
]

const NODE_GLOBALS = [
  'process', 'Buffer', 'global', '__dirname', '__filename', 'require',
  'module', 'exports', 'setImmediate', 'clearImmediate',
]

// 模板里的内建变量
const TEMPLATE_GLOBALS = [
  '$event', '$slots', '$props', '$attrs', '$emit', '$el', '$refs',
  '$nextTick', '$forceUpdate', '$options', '$root', '$data', '$children',
  '_ctx', '_cache', '__props', '$setup', 'key', 'ref',
]

const BASE = new Set([...RUNTIME_GLOBALS, ...TEMPLATE_GLOBALS])
const ENV = {
  browser: new Set([...BASE, ...BROWSER_GLOBALS]),
  node: new Set([...BASE, ...NODE_GLOBALS]),
}

function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent)
    return
  }
  if (typeof node.type !== 'string') return
  visit(node, parent)
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const value = node[key]
    if (value && typeof value === 'object') walk(value, visit, node)
  }
}

// Options API: props / data / computed / methods / inject / setup 返回的对象,
// 其键名都会暴露给模板, 需要算作已声明
function propKeyName(prop) {
  if (prop.computed || prop.type === 'SpreadElement') return null
  if (prop.key?.type === 'Identifier') return prop.key.name
  if (prop.key?.type === 'Literal') return String(prop.key.value)
  return null
}

function collectObjectKeys(node, out) {
  if (!node || node.type !== 'ObjectExpression') return
  for (const prop of node.properties) {
    const name = propKeyName(prop)
    if (name) out.add(name)
  }
}

function collectOptionsKeys(value, out) {
  if (!value) return
  if (value.type === 'ObjectExpression') {
    collectObjectKeys(value, out)
    return
  }
  if (value.type === 'ArrayExpression') {
    for (const el of value.elements) {
      if (el?.type === 'Literal' && typeof el.value === 'string') out.add(el.value)
    }
    return
  }
  if (value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression') {
    walk(value.body, (n) => {
      if (n.type === 'ReturnStatement' && n.argument) collectObjectKeys(n.argument, out)
    })
  }
}

// 这些选项内部定义的键名会暴露给模板
const OPTIONS_KEYS = new Set(['props', 'computed', 'methods', 'inject', 'data', 'setup'])

function collectPatternNames(node, out) {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      out.add(node.name)
      break
    case 'ObjectPattern':
      for (const prop of node.properties) {
        collectPatternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
      }
      break
    case 'ArrayPattern':
      for (const el of node.elements) collectPatternNames(el, out)
      break
    case 'AssignmentPattern':
      collectPatternNames(node.left, out)
      break
    case 'RestElement':
      collectPatternNames(node.argument, out)
      break
    default:
      break
  }
}

// 判断某个 Identifier 是否只是「名字」而非「求值引用」
function isNonReferenceIdentifier(node, parent) {
  // 没有父节点 = 它就是整段表达式的根(例如模板里 {{ foo }} 的 foo), 属于引用
  if (!parent) return false
  switch (parent.type) {
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return parent.property === node && !parent.computed
    case 'Property':
      // { a: 1 } 的 key 不算引用; { a } 简写时 key 同时是 value, 算引用
      return parent.key === node && !parent.computed && !parent.shorthand
    case 'MethodDefinition':
    case 'PropertyDefinition':
      return parent.key === node && !parent.computed
    case 'ImportSpecifier':
      return parent.imported === node
    case 'ExportSpecifier':
      return parent.exported === node
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return parent.label === node
    case 'MetaProperty':
      return true
    default:
      return false
  }
}

function analyze(code, envName, fileLabel) {
  const env = ENV[envName]
  let ast
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      locations: true,
    })
  } catch (e) {
    return { parseError: `${fileLabel}: ${e.message}` }
  }

  const bindings = new Set()
  walk(ast, (node) => {
    switch (node.type) {
      case 'VariableDeclarator':
        collectPatternNames(node.id, bindings)
        break
      case 'FunctionDeclaration':
        if (node.id) bindings.add(node.id.name)
        for (const p of node.params) collectPatternNames(p, bindings)
        break
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.id) bindings.add(node.id.name)
        for (const p of node.params) collectPatternNames(p, bindings)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) bindings.add(node.id.name)
        break
      case 'ImportDeclaration':
        for (const s of node.specifiers) bindings.add(s.local.name)
        break
      case 'CatchClause':
        collectPatternNames(node.param, bindings)
        break
      case 'Property': {
        const name = propKeyName(node)
        if (name && OPTIONS_KEYS.has(name)) collectOptionsKeys(node.value, bindings)
        break
      }
      case 'CallExpression': {
        // defineProps({ a: ... }) / defineProps(['a']) 的键名会直接暴露给模板
        const callee = node.callee
        if (callee?.type === 'Identifier' && callee.name === 'defineProps' && node.arguments[0]) {
          collectOptionsKeys(node.arguments[0], bindings)
        }
        break
      }
      default:
        break
    }
  })

  const unbound = []
  walk(ast, (node, parent) => {
    if (node.type !== 'Identifier') return
    if (isNonReferenceIdentifier(node, parent)) return
    if (bindings.has(node.name) || env.has(node.name)) return
    unbound.push({ name: node.name, line: node.loc?.start?.line ?? 0, col: (node.loc?.start?.column ?? 0) + 1 })
  })

  return { unbound, bindings }
}

// ---- 模板表达式抽取: {{ expr }} 与指令属性值 ----
function extractTemplateExpressions(template) {
  const exprs = []
  const push = (code, index) => {
    const text = String(code).trim()
    if (text) exprs.push({ code: text, index })
  }

  // {{ ... }}
  const mustache = /\{\{([\s\S]*?)\}\}/g
  let m
  while ((m = mustache.exec(template))) push(m[1], m.index)

  // 属性: 只挑会参与求值的指令/绑定
  const attrRe = /([:@#]?[a-zA-Z][\w:.-]*)\s*=\s*"([^"]*)"/g
  while ((m = attrRe.exec(template))) {
    const name = m[1]
    const value = m[2]
    if (!/^([:@#]|v-)/.test(name)) continue
    // v-for / v-slot 的写法不是纯表达式, 单独处理
    if (name === 'v-for' || /^v-slot(:|$)/.test(name) || name.startsWith('#')) continue
    push(value, m.index)
  }

  // v-for="item in list" —— 只检查右侧的集合表达式, 左侧是局部绑定
  const forRe = /v-for\s*=\s*"([\s\S]*?)"/g
  while ((m = forRe.exec(template))) {
    const body = m[1].match(/^([\s\S]*?)\s+(?:in|of)\s+([\s\S]+)$/)
    if (body) push(body[2], m.index)
  }
  return exprs
}

function extractTemplateBindings(template) {
  const local = new Set()
  const forRe = /v-for\s*=\s*"([\s\S]*?)"/g
  let m
  while ((m = forRe.exec(template))) {
    const split = m[1].match(/^([\s\S]*?)\s+(?:in|of)\s+([\s\S]+)$/)
    if (split) addPatternBindings(split[1], local)
  }
  const slotRe = /v-slot(?::[\w-]+)?\s*=\s*"([\s\S]*?)"|#[\w-]+\s*=\s*"([\s\S]*?)"/g
  while ((m = slotRe.exec(template))) {
    addPatternBindings(m[1] || m[2] || '', local)
  }
  return local
}

// 把 v-for / v-slot 左侧的「绑定形状」丢进箭头函数参数位解析,
// 这样 `(a, b)` / `{ id, name }` / `item` 三种写法都能拿到名字
function addPatternBindings(text, out) {
  let src = String(text).trim()
  if (!src) return
  // v-for="(a, b) in list" 左值带一层括号, 剥掉后才能当作参数列表解析
  if (src.startsWith('(') && src.endsWith(')')) src = src.slice(1, -1).trim()
  if (!src) return
  try {
    const ast = acorn.parse(`(${src}) => {}`, { ecmaVersion: 'latest' })
    const params = ast.body[0]?.expression?.params || []
    for (const p of params) collectPatternNames(p, out)
  } catch {
    // 解析不了的写法直接忽略, 宁可少收也不误报
  }
}

function analyzeTemplate(template, envName, fileLabel, scriptBindings) {
  // 模板能访问 <script setup> 暴露的所有绑定 + v-for/v-slot 引入的局部名
  const bindings = new Set([...(scriptBindings || []), ...extractTemplateBindings(template)])
  const env = ENV[envName]
  const unbound = []
  for (const { code, index } of extractTemplateExpressions(template)) {
    let ast
    try {
      ast = acorn.parseExpressionAt(code, 0, { ecmaVersion: 'latest', locations: true })
    } catch {
      try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true })
      } catch {
        continue // 无法解析的模板片段(如 v-on 的对象语法变体)直接放过, 避免误报
      }
    }
    walk(ast, (node, parent) => {
      if (node.type !== 'Identifier') return
      if (isNonReferenceIdentifier(node, parent)) return
      if (bindings.has(node.name) || env.has(node.name)) return
      if (unbound.some((u) => u.name === node.name)) return
      unbound.push({ name: node.name, line: 0, col: 0, inTemplate: true, snippet: code.slice(0, 60) })
    })
  }
  return { unbound }
}

// ---------------- 主流程 ----------------
function listFiles(dir, exts) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full, exts))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

const targets = [
  ...listFiles(path.join(ROOT, 'src'), ['.js', '.vue']),
  ...listFiles(path.join(ROOT, 'server'), ['.js']),
]

const problems = []
const parseErrors = []

for (const file of targets) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const envName = rel.startsWith('server/') ? 'node' : 'browser'
  const source = fs.readFileSync(file, 'utf8')

  if (file.endsWith('.vue')) {
    const { descriptor, errors } = parseSFC(source, { filename: file })
    if (errors && errors.length) {
      parseErrors.push(...errors.map((e) => `${rel}: ${e.message || e}`))
      continue
    }
    const scriptCode = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
    let scriptBindings = new Set()
    if (scriptCode) {
      const res = analyze(scriptCode, envName, rel)
      if (res.parseError) parseErrors.push(res.parseError)
      scriptBindings = res.bindings || new Set()
      for (const u of res.unbound || []) problems.push({ file: rel, ...u })
    }
    if (descriptor.template?.content) {
      const res = analyzeTemplate(descriptor.template.content, envName, rel, scriptBindings)
      for (const u of res.unbound || []) problems.push({ file: rel, ...u })
    }
  } else {
    const res = analyze(source, envName, rel)
    if (res.parseError) parseErrors.push(res.parseError)
    for (const u of res.unbound || []) problems.push({ file: rel, ...u })
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ problems, parseErrors }, null, 2))
} else if (!problems.length && !parseErrors.length) {
  console.log(`✓ 未发现未定义标识符 (已扫描 ${targets.length} 个文件)`)
} else {
  const grouped = new Map()
  for (const p of problems) {
    if (!grouped.has(p.file)) grouped.set(p.file, [])
    grouped.get(p.file).push(p)
  }
  for (const [file, items] of grouped) {
    console.log(`\n${file}`)
    for (const it of items) {
      const where = it.inTemplate ? `模板 (${it.snippet})` : `${it.line}:${it.col}`
      console.log(`  ${where}  ->  ${it.name}`)
    }
  }
  for (const e of parseErrors) console.log(`\n[解析失败] ${e}`)
  console.log(`\n共 ${problems.length} 处可疑未定义引用, 涉及 ${grouped.size} 个文件`)
}

process.exit(problems.length ? 1 : 0)
