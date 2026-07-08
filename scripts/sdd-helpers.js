import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sddDir = path.join(repoRoot, '.superpowers', 'sdd')

// Ensure workspace directory exists
if (!fs.existsSync(sddDir)) {
  fs.mkdirSync(sddDir, { recursive: true })
}
fs.writeFileSync(path.join(sddDir, '.gitignore'), '*\n')

const command = process.argv[2]

if (command === 'brief') {
  const planFile = process.argv[3]
  const taskNumber = process.argv[4]

  if (!planFile || !taskNumber) {
    console.error('Usage: node scripts/sdd-helpers.js brief <plan_file> <task_number>')
    process.exit(1)
  }

  const planPath = path.resolve(repoRoot, planFile)
  if (!fs.existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(planPath, 'utf8')
  const lines = content.split(/\r?\n/)

  let inTask = false
  const taskLines = []
  const taskRegex = new RegExp(`^###\\s+Task\\s+${taskNumber}(?:[^0-9]|$)`, 'i')
  const nextTaskRegex = /^###\s+Task\s+\d+/i

  let infence = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      infence = !infence
    }
    if (!infence) {
      if (taskRegex.test(line)) {
        inTask = true
        taskLines.push(line)
        continue
      } else if (nextTaskRegex.test(line) && inTask) {
        break
      }
    }
    if (inTask) {
      taskLines.push(line)
    }
  }

  if (taskLines.length === 0) {
    console.error(`Task ${taskNumber} not found in ${planFile}`)
    process.exit(1)
  }

  const outFile = path.join(sddDir, `task-${taskNumber}-brief.md`)
  fs.writeFileSync(outFile, taskLines.join('\n'), 'utf8')
  console.log(outFile)
} else if (command === 'review') {
  const base = process.argv[3]
  const head = process.argv[4]

  if (!base || !head) {
    console.error('Usage: node scripts/sdd-helpers.js review <base> <head>')
    process.exit(1)
  }

  try {
    const baseShort = execSync(`git rev-parse --short ${base}`, { encoding: 'utf8' }).trim()
    const headShort = execSync(`git rev-parse --short ${head}`, { encoding: 'utf8' }).trim()
    const outFile = path.join(sddDir, `review-${baseShort}..${headShort}.diff`)

    const commits = execSync(`git log --oneline ${base}..${head}`, { encoding: 'utf8' })
    const stat = execSync(`git diff --stat ${base}..${head}`, { encoding: 'utf8' })
    const diff = execSync(`git diff -U10 ${base}..${head}`, { encoding: 'utf8' })

    const reviewContent = [
      `# Review package: ${base}..${head}`,
      '',
      '## Commits',
      commits,
      '',
      '## Files changed',
      stat,
      '',
      '## Diff',
      diff,
    ].join('\n')

    fs.writeFileSync(outFile, reviewContent, 'utf8')
    console.log(outFile)
  } catch (error) {
    console.error('Failed to generate review package:', error)
    process.exit(1)
  }
} else {
  console.error('Unknown command. Use "brief" or "review".')
  process.exit(1)
}
