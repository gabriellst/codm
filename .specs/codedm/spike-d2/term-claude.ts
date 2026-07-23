// Criterion 1b — drive the real claude TUI in a PTY
const CLAUDE = "/Applications/cmux.app/Contents/Resources/bin/claude"
const projDir = process.argv[2]
if (!projDir) throw new Error("pass project dir")

const dec = new TextDecoder()
const frames: string[] = []
let notify: (() => void) | null = null

function output() { return frames.join("") }
// strip ANSI for matching
function plain() { return output().replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g, "") }
// TUI paints spacing via cursor motion, so compare with ALL whitespace removed
function squashed() { return plain().replace(/\s+/g, "") }

async function waitFor(pattern: RegExp, timeoutMs: number, label: string) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pattern.test(squashed())) return
    await new Promise<void>((res) => {
      notify = res
      setTimeout(res, 250)
    })
    notify = null
  }
  throw new Error(`timeout(${label}) waiting ${pattern}\n--- last 3000 chars (plain) ---\n${squashed().slice(-3000)}`)
}

// clean env: don't inherit an active claude-code session's vars
const env: Record<string, string> = { ...process.env } as any
delete env.CLAUDECODE
delete env.CLAUDE_CODE_ENTRYPOINT
delete env.CLAUDE_CODE_SSE_PORT
env.TERM = "xterm-256color"

const proc = Bun.spawn([CLAUDE], {
  cwd: projDir,
  env,
  terminal: {
    cols: 100,
    rows: 30,
    data(_t, d) {
      frames.push(dec.decode(d))
      notify?.()
    },
    exit(_t, c, s) { console.log("[pty-exit]", c, s) },
  },
})
console.log("claude pid:", proc.pid)

try {
  // 1. boot: banner or trust prompt
  await waitFor(/(trustthisfolder|Yes,Itrust|WelcometoClaude)/i, 30000, "boot")
  console.log("[ok] boot output detected. frame count so far:", frames.length)
  const sawTrust = /(trustthisfolder|Yes,Itrust)/i.test(squashed())
  console.log("[info] trust prompt visible:", sawTrust)

  if (sawTrust) {
    // answer trust prompt: Enter selects default (Yes)
    proc.terminal!.write("\r")
    console.log("[ok] sent Enter to trust prompt")
  }

  // 2. wait for the main input UI (prompt box chars or shortcut hint)
  await waitFor(/(forshortcuts|esctointerrupt|bypasspermissions|Try")/i, 30000, "main-ui")
  console.log("[ok] main TUI reached. total frames:", frames.length)

  // 3. type a keystroke sequence into the prompt and verify echo frame arrives
  const before = frames.length
  proc.terminal!.write("hello-spike")
  await waitFor(/hello-spike/, 10000, "echo")
  console.log("[ok] typed text echoed in TUI frames (frames grew", frames.length - before, ")")

  // 4. resize while running
  proc.terminal!.resize(120, 40)
  await new Promise((r) => setTimeout(r, 500))
  console.log("[ok] resize sent, frames now:", frames.length)
} finally {
  // 5. clean kill
  proc.kill("SIGTERM")
  const exited = await Promise.race([
    proc.exited,
    new Promise<string>((r) => setTimeout(() => r("TIMEOUT"), 5000)),
  ])
  if (exited === "TIMEOUT") {
    console.log("[warn] SIGTERM ignored, sending SIGKILL")
    proc.kill("SIGKILL")
    await proc.exited
  }
  console.log("[ok] claude exited, code/signal:", exited, proc.signalCode)
  proc.terminal!.close()
  console.log("[ok] terminal closed:", proc.terminal!.closed)
  console.log("PID_FOR_ZOMBIE_CHECK:", proc.pid)
}
process.exit(0)
