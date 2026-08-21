// Trusted-code confirmation for imported projects.
//
// "The user shall be able to import an exported project only through an explicit
// trusted-code confirmation."
//
// This is an in-page dialog rather than window.confirm() for two reasons: a native
// dialog blocks the whole page including the draw loop, and it cannot show the
// performer what they are about to run. A confirmation that does not show the thing
// being confirmed is theater.
//
// The default action is Cancel. Importing is the deliberate act.

export function createConfirmDialog() {
  let resolveCurrent = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 id="dialog-title"></h2>
      <p class="dialog-body"></p>
      <pre class="dialog-preview"></pre>
      <p class="dialog-warning"></p>
      <div class="dialog-actions">
        <button type="button" class="dialog-cancel">Cancel</button>
        <button type="button" class="dialog-confirm"></button>
      </div>
    </div>`;
  document.body.append(backdrop);

  const titleNode = backdrop.querySelector('#dialog-title');
  const bodyNode = backdrop.querySelector('.dialog-body');
  const previewNode = backdrop.querySelector('.dialog-preview');
  const warningNode = backdrop.querySelector('.dialog-warning');
  const cancelButton = backdrop.querySelector('.dialog-cancel');
  const confirmButton = backdrop.querySelector('.dialog-confirm');

  function settle(value) {
    backdrop.hidden = true;
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.(value);
  }

  cancelButton.addEventListener('click', () => settle(false));
  confirmButton.addEventListener('click', () => settle(true));
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) settle(false);
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') settle(false);
  });

  /**
   * @param {{title: string, body: string, preview?: string, warning?: string, confirmLabel?: string}} options
   * @returns {Promise<boolean>}
   */
  function ask({ title, body, preview = '', warning = '', confirmLabel = 'Confirm' }) {
    titleNode.textContent = title;
    bodyNode.textContent = body;
    previewNode.textContent = preview;
    previewNode.hidden = preview === '';
    warningNode.textContent = warning;
    warningNode.hidden = warning === '';
    confirmButton.textContent = confirmLabel;
    backdrop.hidden = false;
    // Focus Cancel, not Confirm — a stray Return must not run someone else's code.
    cancelButton.focus();
    return new Promise((resolve) => {
      resolveCurrent = resolve;
    });
  }

  return { ask };
}
