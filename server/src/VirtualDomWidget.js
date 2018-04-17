const RenderLoop = require('./RenderLoop');
const Timer = require('./Timer');
const runCommand = require('./runCommand');
const snabbdom = require('snabbdom');
const html = require('snabbdom-pragma').createElement;
window.html = html;

const patch = snabbdom.init([
  require('./SnabbdomCssModule'),
  require('snabbdom/modules/props').default,
  require('snabbdom/modules/attributes').default,
  require('snabbdom/modules/style').default,
  require('snabbdom/modules/eventlisteners').default,
]);

const defaults = {
  id: 'widget',
  refreshFrequency: 1000,
  init: function init() {},
  render: function render(props) {
    return html('div', null, props.output);
  },
  updateState: function updateState(action) {
    if (action.type === 'UB/COMMAND_RAN') {
      return { error: action.error, output: action.output };
    }
    return props;
  },
  initialState: { output: '', error: null },
};

module.exports = function VirtualDomWidget(widgetObject) {
  const api = {};
  let implementation;
  let wrapperEl;
  let commandLoop;
  let renderLoop;

  function init(widget) {
    implementation = eval(widget.body)(widget.id);
    implementation.id = widget.id;

    for (var k in defaults) {
      if (implementation[k] === undefined ||
          implementation[k] === null) {
        implementation[k] = defaults[k];
      }
    }

    return api;
  }

  function start() {
    implementation.init(dispatch);
    commandLoop = Timer()
      .map((done) => {
        runCommand(
          implementation,
          (err, output) => {
            dispatch({ type: 'UB/COMMAND_RAN', error: err, output: output });
            done(implementation.refreshFrequency);
          },
          dispatch
        );
      })
      .start();
  }

  function dispatch(action) {
    renderLoop.update(
      implementation.updateState(action, renderLoop.state)
    );
  }

  function render(state) {
    try {
      return implementation.render(state, dispatch);
    } catch (e) {
      console.error(e);
      return html('div', {}, e.message);
    }
  }

  api.create = function create() {
    const contentEl = document.createElement('div');
    wrapperEl = document.createElement('div');
    wrapperEl.id = implementation.id;
    wrapperEl.className = 'widget';
    wrapperEl.appendChild(contentEl);
    document.body.appendChild(wrapperEl);

    renderLoop = RenderLoop(
      implementation.initialState,
      render,
      patch,
      contentEl
    );

    start();
    return wrapperEl;
  };

  api.destroy = function destroy() {
    commandLoop.stop();
    if (wrapperEl && wrapperEl.parentNode) {
      wrapperEl.parentNode.removeChild(wrapperEl);
    }
    renderLoop = null;
    wrapperEl = null;
  };

  api.update = function update(newImplementation) {
    commandLoop.stop();
    init(newImplementation);
    renderLoop.update(renderLoop.state); // force redraw
    start();
  };

  api.forceRefresh = function forceRefresh() {
    commandLoop.forceTick();
  };

  return init(widgetObject);
};
