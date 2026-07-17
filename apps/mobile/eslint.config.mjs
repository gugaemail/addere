import expoConfig from 'eslint-config-expo/flat.js'

export default [
  ...expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    // Regras de preparação para o React Compiler (não habilitado neste app).
    // Rebaixadas para warning: o padrão `useRef(new Animated.Value(x)).current`
    // é o idiomático em RN/Reanimated, e os `setState` dentro de useEffect
    // sinalizados aqui já são guardados por condição/dependency array (ex.:
    // sincronizar cache local com dados de uma query). Reescrever tudo isso
    // tem mais risco de regressão do que benefício enquanto o Compiler não
    // está ativo — mantido como warning para não travar `npm run lint`.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]
