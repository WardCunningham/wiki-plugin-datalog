
(function() {

  function expand(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\r?\n/g, '<br>')
  };

  function emit($item, item) {
    $item.append(`
      <p style="background-color:#eee;padding:15px;">
        ${expand(item.text)}
      </p>`);
  };

  function bind($item, item) {
    $item.dblclick(() => {
      return wiki.textEditor($item, item);
    });
  };

  if (typeof window !== "undefined" && window !== null) {
    window.plugins.datalog = {emit, bind};
  }

  if (typeof module !== "undefined" && module !== null) {
    module.exports = {expand};
  }

}).call(this);
