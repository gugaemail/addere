import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')

const iconSvg         = readFileSync(join(assetsDir, 'icon-source.svg'))
const adaptiveSvg     = readFileSync(join(assetsDir, 'adaptive-icon-source.svg'))

const tasks = [
  {
    input: iconSvg,
    output: join(assetsDir, 'icon.png'),
    size: 1024,
    label: 'icon.png (iOS + fallback)',
  },
  {
    input: adaptiveSvg,
    output: join(assetsDir, 'adaptive-icon.png'),
    size: 1024,
    label: 'adaptive-icon.png (Android foreground)',
  },
  {
    input: iconSvg,
    output: join(assetsDir, 'favicon.png'),
    size: 48,
    label: 'favicon.png (web)',
  },
  {
    input: adaptiveSvg,
    output: join(assetsDir, 'splash-icon.png'),
    size: 1024,
    label: 'splash-icon.png (splash screen)',
  },
]

console.log('Gerando ícones do Addere...\n')

for (const task of tasks) {
  await sharp(task.input)
    .resize(task.size, task.size)
    .png()
    .toFile(task.output)

  console.log(`✓ ${task.label} → ${task.size}x${task.size}px`)
}

console.log('\nTodos os ícones gerados com sucesso!')
