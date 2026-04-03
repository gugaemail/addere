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
