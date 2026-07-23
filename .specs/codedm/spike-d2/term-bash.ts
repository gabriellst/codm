// Criterion 1a — drive an interactive bash in a real PTY via Bun.Terminal
const chunks: string[] = []
const dec = new TextDecoder()
let resolveWait: (() => void) | null = null

function output() {
  return chunks.join("")
}
function waitFor(pattern: RegExp, timeoutMs = 5000): Promise<void> {
  return new Promise((res, rej) => {
    const check = () => {
      if (pattern.test(output())) {
        resolveWait = null
        res()
        return true
      }
      return false
    }
    if (check()) return
    resolveWait = () => check()
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${pattern}\n--- output ---\n${output()}`)), timeoutMs)
    const origRes = res
    res = () => { clearTimeout(t); origRes() }
    resolveWait = () => {
      if (pattern.test(output())) { clearTimeout(t); origRes(); resolveWait = null }
    }
  })
}

const proc = Bun.spawn(["bash", "-i"], {
  terminal: {
    cols: 80,
    rows: 24,
    name: "xterm-256color",
    data(_term, data) {
      chunks.push(dec.decode(data))
      resolveWait?.()
    },
    exit(_term, code, signal) {
      console.log("[pty-exit]", code, signal)
    },
  },
  env: { ...process.env, PS1: "SPIKE$ " },
})

console.log("pid:", proc.pid, "isTTY-check next; stdin/stdout are:", proc.stdin, proc.stdout)

// 1. wait for prompt
await waitFor(/SPIKE\$/)
console.log("[ok] got interactive prompt")

// 2. verify child sees a real TTY
proc.terminal!.write("tty; [ -t 0 ] && echo IS_A_TTY\n")
await waitFor(/IS_A_TTY/)
console.log("[ok] child stdin is a TTY:", /\/dev\/ttys\d+/.exec(output())?.[0])

// 3. run a command, read echoed + result incrementally
proc.terminal!.write("echo $((6*7))\n")
await waitFor(/\b42\b/)
console.log("[ok] incremental read of command result (42)")

// 4. resize + verify child observed it
proc.terminal!.write("stty size\n")
await waitFor(/24 80/)
proc.terminal!.resize(120, 40)
proc.terminal!.write("stty size\n")
await waitFor(/40 120/)
console.log("[ok] resize 80x24 -> 120x40 observed by child (stty size = 40 120)")

// 5. clean exit
proc.terminal!.write("exit\n")
const code = await proc.exited
console.log("[ok] bash exited with code", code)
proc.terminal!.close()
console.log("[ok] terminal closed, closed =", proc.terminal!.closed)
process.exit(0)
