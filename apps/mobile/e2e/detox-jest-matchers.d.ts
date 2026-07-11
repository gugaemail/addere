// detox integra seus matchers (toBeVisible, toHaveText, ...) via expect.extend()
// no runner do Jest, mas não expõe essa augmentação nos tipos que empacota
// (aqueles cobrem apenas o Detox.Expect standalone, usado sem Jest).
export {}

declare global {
  namespace jest {
    interface Matchers<R, T = {}> {
      toBeVisible(percent?: number): Promise<R>
      toHaveText(text: string): Promise<R>
    }
  }
}
