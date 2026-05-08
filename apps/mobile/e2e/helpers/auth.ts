export async function loginAs(role: 'rep' | 'manager') {
  const credentials = {
    rep:     { email: 'rep@addere.test',     password: 'test123' },
    manager: { email: 'manager@addere.test', password: 'test123' },
  }
  await element(by.id('input-email')).typeText(credentials[role].email)
  await element(by.id('input-password')).typeText(credentials[role].password)
  await element(by.id('btn-login')).tap()
  await waitFor(element(by.id('screen-home'))).toBeVisible().withTimeout(5000)
}
