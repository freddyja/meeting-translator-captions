const mark = `
<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect width="64" height="64" rx="14" fill="#132024"/>
  <rect x="10" y="14" width="28" height="8" rx="4" fill="#2bb3a3"/>
  <rect x="10" y="28" width="44" height="8" rx="4" fill="#7fd1c7"/>
  <rect x="10" y="42" width="36" height="8" rx="4" fill="#e7f4f2"/>
</svg>
`;

export function brandBlock(compact = false): string {
  return `
    <div class="brand ${compact ? "brand-compact" : ""}">
      ${mark}
      <div class="brand-text">
        <h1>Meeting Translator</h1>
        <p class="brand-credit">Designed by Freddy Jara-Almonte</p>
      </div>
    </div>
  `;
}

export function creditFooter(): string {
  return `<footer class="credit-footer">Meeting Translator</footer>`;
}
