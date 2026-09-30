/**
 * On Apple Silicon an x64 Node (Rosetta) makes Playwright launch a translated Chrome, which inflates
 * every timing about 50x. Abort early unless Node and Chrome are both native arm64.
 */
export async function assertNativeChrome(browser) {
  if (process.platform !== 'darwin') return process.arch;
  if (process.arch !== 'arm64') {
    throw new Error(`Node is ${process.arch}, not arm64. Run: export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`);
  }
  let page = await browser.newPage();
  try {
    let text = '';
    try {
      await page.goto('chrome://version');
      text = await page.locator('body').innerText();
    } catch {
      // Playwright's bundled headless shell has no chrome://version (the tab lands on an error page): ask
      // the browser for its CPU architecture instead, from a fresh page on a locally fulfilled localhost URL
      // (userAgentData needs a secure context; nothing goes over the network).
      await page.close();
      page = await browser.newPage();
      await page.route('http://localhost/', (route) => route.fulfill({ contentType: 'text/html', body: '' }));
      await page.goto('http://localhost/');
      const arch = await page.evaluate(async () => {
        const uad = navigator.userAgentData;
        return uad ? (await uad.getHighEntropyValues(['architecture'])).architecture : 'unknown';
      });
      text = arch === 'arm' ? '(arm64)' : `(${arch})`;
    }
    if (/translated/i.test(text) || !/\(arm64\)/.test(text)) {
      throw new Error(
        `Chrome is not running natively on arm64 (${text.split('\n').find((l) => /Official Build|arm|x86/i.test(l)) ?? text.slice(0, 120)}).\n` +
          'Launch it through a wrapper script passed as executablePath, containing:\n' +
          '  exec /usr/bin/arch -arm64 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"',
      );
    }
    return 'arm64';
  } finally {
    await page.close();
  }
}
