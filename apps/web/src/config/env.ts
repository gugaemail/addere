if (!process.env.NEXT_PUBLIC_API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL não está definida — copie .env.local.example para .env.local')
}

export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
} as const
