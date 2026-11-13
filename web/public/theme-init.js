(function () {
  try {
    var theme = localStorage.getItem('sjp-theme');
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    var density = localStorage.getItem('sjp-density');
    document.documentElement.dataset.density = density === 'comfy' ? 'comfy' : 'compact';
  } catch (e) {}
})();
