// Wires up the show/hide toggle button rendered by login.ftl next to the
// password field: [data-password-toggle] with aria-controls pointing at the
// password input, and data-icon-show/data-icon-hide + data-label-show/
// data-label-hide carrying the class/label pair to swap between states.
document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  const icon = button.querySelector('i');
  if (!input || !icon) return;

  const iconShow = button.dataset.iconShow;
  const iconHide = button.dataset.iconHide;
  const labelShow = button.dataset.labelShow;
  const labelHide = button.dataset.labelHide;

  button.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';

    if (iconShow) icon.classList.remove(...iconShow.split(' '));
    if (iconHide) icon.classList.remove(...iconHide.split(' '));
    const nextIconClass = isHidden ? iconHide : iconShow;
    if (nextIconClass) icon.classList.add(...nextIconClass.split(' '));

    const nextLabel = isHidden ? labelHide : labelShow;
    if (nextLabel) button.setAttribute('aria-label', nextLabel);
  });
});
