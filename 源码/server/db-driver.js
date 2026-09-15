// SQLite 驱动适配: 原生优先, 装不上就落回纯 JS 实现
//
// 三级兜底(顺序见文件末尾):
//   1. better-sqlite3        本机开发用, 原生模块, 最快; 只装在 devDependencies 之外的可选区
//   2. node:sqlite           Node 22+ 内置, 不需要装任何包 —— 线上沙箱走的就是它
//   3. node-sqlite3-wasm     纯 WebAssembly, 零编译; 但它打不开 WAL 模式的库, 只能作最后兜底
//
// ★ 线上发布目录(TimePick_cloud/package.json)**不声明** better-sqlite3:
//   2026-10-20 那次发布, 沙箱把原生 .node 装上了, 进程一启动就 Segmentation fault,
//   段错误发生在 dlopen 阶段, try/catch 接不住, 表现就是「服务没起来」。
//   去掉这个依赖后沙箱只会用 node:sqlite, 与之前成功的发布一致。
//
// 两者对外统一成同一套接口: exec / prepare(sql).get|all|run / pragma / close。
//
// 可用环境变量 DB_DRIVER=better-sqlite3|wasm|node:sqlite 强制指定驱动(本地回归测试用)。

import { createRequire } from 'node:module'

function bindArgs(args) {
  if (!args.length) return undefined
  // SQLite 没有布尔类型; WASM 驱动对 true/false/undefined 会报不支持的值类型
  return args.map(toSqliteValue)
}

function wrapBetterSqlite3Instance(db) {
  return {
    name: 'better-sqlite3',
    exec: (sql) => db.exec(sql),
    pragma: (sql) => db.pragma(sql),
    prepare: (sql) => db.prepare(sql),
    close: () => db.close(),
  }
}

function wrapWasmInstance(db) {
  // 注意: 这里用 db.get/all/run 这类便捷方法而不是 prepare(),
  // 因为它们会在内部自动 finalize; 而本项目的代码从不调 stmt.finalize(),
  // 用 prepare() 会攒出一堆未释放的语句(该库的 README 明确要求手动释放)。
  return {
    name: 'node-sqlite3-wasm',
    exec: (sql) => db.exec(sql),
    pragma: (sql) => {
      try {
        db.exec('PRAGMA ' + sql)
      } catch {
        // WAL 之类的 pragma 在该 VFS 上不受支持时忽略, 用默认日志模式也能跑
      }
    },
    prepare: (sql) => ({
      get: (...args) => db.get(sql, bindArgs(args)),
      all: (...args) => db.all(sql, bindArgs(args)),
      run: (...args) => db.run(sql, bindArgs(args)),
    }),
    close: () => db.close(),
  }
}

// Node 内置的 SQLite(Node 22.5+): 需要 --experimental-sqlite 才有,
// 作为最后一道兜底 —— 它不需要安装任何包, 只要 flag 打开了就能用。
function wrapNodeSqlite(db) {
  return {
    name: 'node:sqlite',
    exec: (sql) => db.exec(sql),
    pragma: (sql) => {
      try {
        db.exec('PRAGMA ' + sql)
      } catch {
        /* 同 WASM: 不支持的 pragma 忽略 */
      }
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql)
      const vals = (args) => (args.length ? args.map(toSqliteValue) : [])
      return {
        get: (...args) => stmt.get(...vals(args)),
        all: (...args) => stmt.all(...vals(args)),
        run: (...args) => stmt.run(...vals(args)),
      }
    },
    close: () => db.close(),
  }
}

function toSqliteValue(v) {
  return v === true ? 1 : v === false ? 0 : v === undefined ? null : v
}

// CJS / ESM 互操作时导出形状不总是稳定: node-sqlite3-wasm 有时给的是
// `{ Database }`, 有时整个模块对象就是 constructor(better-sqlite3 的 default 就是)。
// 所以这里逐个候选形式试构造, 能造出带 exec/prepare 的对象就用它。
function candidatesOfDriver(mod) {
  return [mod?.default, mod?.Database, mod?.default?.Database, mod]
}

function buildExecutable(Ctor, file) {
  const instance = typeof Ctor === 'function' ? new Ctor(file) : null
  if (
    instance &&
    typeof instance.exec === 'function' &&
    typeof instance.prepare === 'function'
  ) {
    return instance
  }
  return null
}

function describe(mod) {
  if (!mod || typeof mod !== 'object') return String(typeof mod)
  const keys = Object.keys(mod)
  return `${keys.join(',') || '(空)'} / default=${Object.keys(mod.default || {}).join(',') || '(空)'}`
}

async function loadModuleBothWays(spec) {
  // ESM 动态 import 与 CJS require 拿到的导出对象不一定等价, 两条路都试
  const mods = []
  try {
    mods.push(await import(spec))
  } catch {
    /* 包不存在或只支持 CJS, 交给下面的 require 兜 */
  }
  try {
    mods.push(createRequire(import.meta.url)(spec))
  } catch {
    /* 同理忽略 */
  }
  return mods
}

async function openWith(spec, file, native) {
  const mods = await loadModuleBothWays(spec)
  let lastErr = null
  for (const mod of mods) {
    for (const Ctor of candidatesOfDriver(mod)) {
      try {
        const instance = buildExecutable(Ctor, file)
        if (!instance) continue
        return native ? wrapBetterSqlite3Instance(instance) : wrapWasmInstance(instance)
      } catch (e) {
        lastErr = e
      }
    }
  }
  const detail = mods.map(describe).join(' | ') || '模块加载失败'
  throw new Error(`${spec} 初始化失败 [${detail}] 原因: ${lastErr?.message || '无可用导出'}`)
}

// 到底用哪个驱动, 由 tryOrder 决定; forced 用于本地回归测试
async function openBuiltin(file) {
  const builtin = await import('node:sqlite')
  const db = new builtin.DatabaseSync(file)
  if (typeof db.exec === 'function' && typeof db.prepare === 'function') return wrapNodeSqlite(db)
  throw new Error('导出形状不被识别(可能没开 --experimental-sqlite)')
}

export async function openDatabase(file) {
  const forced = (process.env.DB_DRIVER || '').trim().toLowerCase()
  const ORDER_MAP = {
    'better-sqlite3': ['better-sqlite3'],
    wasm: ['wasm'],
    // node:sqlite / builtin / nodedb 都指向 Node 内置模块
    'node:sqlite': ['node:sqlite'],
    builtin: ['node:sqlite'],
    nodedb: ['node:sqlite'],
  }
  // 默认顺序: 原生优先, 装不上就落回纯 JS 实现。
  // ★ 2026-10-20 线上发布时沙箱里的 node 进程启动即 Segmentation fault(core dumped),
  //   原因是部署环境把 optionalDependencies 里的 better-sqlite3(原生 .node) 装上了,
  //   ABI 不匹配的二进制在 dlopen 阶段直接段错误 —— try/catch 接不住。
  //   对策是**发布目录的 package.json 不再声明 better-sqlite3**(见 TimePick_cloud/package.json),
  //   沙箱里就只会走 Node 内置的 node:sqlite。
  //   注意 wasm 不能当首选: 它打不开 journal_mode=WAL 的库, 会报 unable to open database file。
  const order = ORDER_MAP[forced] || ['better-sqlite3', 'node:sqlite', 'wasm']

  const failures = []
  for (const kind of order) {
    try {
      if (kind === 'better-sqlite3') return await openWith('better-sqlite3', file, true)
      if (kind === 'wasm') return await openWith('node-sqlite3-wasm', file, false)
      return await openBuiltin(file)
    } catch (e) {
      failures.push(`${kind}: ${e?.message || e}`)
    }
  }
  throw new Error('没有可用的 SQLite 驱动。' + failures.join('; '))
}
