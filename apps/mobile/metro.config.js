const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Observa todo o monorepo
config.watchFolders = [workspaceRoot]

// Resolve pacotes primeiro em apps/mobile/node_modules, depois na raiz
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Força `react` a sempre resolver para a versão local (React 19) do mobile,
// mesmo quando o require vem de dentro de root/node_modules (ex: react-native).
// extraNodeModules não tem prioridade sobre a hierarquia de node_modules para
// arquivos dentro de root/node_modules; resolveRequest garante interceptação total.
//
// NÃO REMOVA. A raiz do monorepo declara react@18.3.1 (o Next do apps/web) e o
// mobile declara 19.1.0 — o lockfile fixa os dois, e o `npm ci` do EAS reproduz
// esse layout. Sem este bloco, o require de dentro do react-native resolveria
// para o React 18 da raiz e o app quebra em runtime, não no type-check.
//
// Por causa disso o `expo-doctor` acusa "duplicate dependencies: react" de forma
// permanente. É esperado: em 23/09/2026 o bundle de produção foi exportado e
// contém uma única versão de React, a 19.1.0. Para reconferir depois de mexer
// aqui:
//   npx expo export --platform android --output-dir <dir>
//   grep -a -o -F 18.3.1 <dir>/_expo/static/js/android/*.hbc   # tem de vir vazio
const localReact = path.join(projectRoot, 'node_modules', 'react')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const subPath = moduleName === 'react' ? 'index.js' : moduleName.slice('react/'.length)
    return {
      filePath: path.join(localReact, subPath + (subPath.endsWith('.js') ? '' : '.js')),
      type: 'sourceFile',
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
