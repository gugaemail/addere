import '@testing-library/jest-dom'

// Variáveis de ambiente necessárias para os módulos do Next.js no ambiente de teste
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3333'
process.env.JWT_SECRET = 'test-jwt-secret-for-web-unit-tests'
