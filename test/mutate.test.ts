// @ts-nocheck

import mutate, {
  disconnectGlobalObserver,
  connectGlobalObserver,
} from '../src';

let _cleanup: (() => void)[] = [];
function cleanup(f: () => void) {
  _cleanup.push(f);
}
function revertAll() {
  // Revert the mutations in reverse order
  for (let i = _cleanup.length - 1; i >= 0; i--) {
    _cleanup[i]();
  }
  _cleanup = [];
}

describe('mutate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    revertAll();
  });

  it('mutates existing elements and reverts', () => {
    const initial = '<h1>title</h1><p class="text green">wor</p>';
    document.body.innerHTML = initial;

    cleanup(mutate('h1', 'setHTML', 'hello'));
    expect(document.body.innerHTML).toEqual(
      '<h1>hello</h1><p class="text green">wor</p>'
    );

    cleanup(mutate('h1', 'addClass', 'title'));
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text green">wor</p>'
    );

    cleanup(mutate('.text', 'removeClass', 'green'));
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text">wor</p>'
    );

    cleanup(mutate('.text', 'appendHTML', 'ld!'));
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title">hello</h1><p class="text">world!</p>'
    );

    cleanup(mutate('h1.title', 'setAttribute', 'title="title"'));
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title" title="title">hello</h1><p class="text">world!</p>'
    );

    cleanup(mutate('h1', 'addClass', 'another'));
    expect(document.body.innerHTML).toEqual(
      '<h1 class="title another" title="title">hello</h1><p class="text">world!</p>'
    );

    revertAll();
    expect(document.body.innerHTML).toEqual(initial);
  });

  it('reapplies changes quickly when mutation occurs', async () => {
    document.body.innerHTML = '<p>original</p>';
    const el = document.querySelector('p');
    if (!el) return;
    cleanup(mutate('p', 'setHTML', 'new'));

    expect(el.innerHTML).toEqual('new');
    el.innerHTML = 'original';
    await new Promise(res => setTimeout(res, 17));
    expect(el.innerHTML).toEqual('new');
  });

  it('reverts correctly after reapplying changes', async () => {
    document.body.innerHTML = '<p>original</p>';
    const el = document.querySelector('p');
    if (!el) return;
    cleanup(mutate('p', 'setHTML', 'new'));
    expect(el.innerHTML).toEqual('new');

    el.innerHTML = 'new normal';
    await new Promise(res => setTimeout(res, 17));
    expect(el.innerHTML).toEqual('new');

    revertAll();
    expect(el.innerHTML).toEqual('new normal');
  });

  it('waits for elements to appear', async () => {
    cleanup(mutate('p', 'setHTML', 'bar'));
    expect(document.body.innerHTML).toEqual('');

    document.body.innerHTML += '<h1>hello</h1>';
    await new Promise(res => setTimeout(res, 17));

    document.body.innerHTML += '<p>foo</p>';
    expect(document.body.innerHTML).toEqual('<h1>hello</h1><p>foo</p>');

    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('<h1>hello</h1><p>bar</p>');
  });

  it('reverts existing attributes correctly', () => {
    document.body.innerHTML = '<p title="foo"></p>';
    cleanup(mutate('p', 'setAttribute', 'title="bar"'));
    expect(document.body.innerHTML).toEqual('<p title="bar"></p>');
    revertAll();
    expect(document.body.innerHTML).toEqual('<p title="foo"></p>');
  });

  it('ignores duplicate values', () => {
    document.body.innerHTML =
      '<h1 title="foo"></h1><p class="test">hello world</p>';
    const el = document.querySelector('p');
    if (!el) return;

    cleanup(mutate('p', 'addClass', 'test'));
    expect(el.className).toEqual('test');

    cleanup(mutate('p', 'removeClass', 'foo'));
    expect(el.className).toEqual('test');

    cleanup(mutate('p', 'setHTML', 'hello world'));
    expect(el.innerHTML).toEqual('hello world');

    cleanup(mutate('h1', 'setAttribute', 'title="foo"'));
    expect(document.body.innerHTML).toEqual(
      '<h1 title="foo"></h1><p class="test">hello world</p>'
    );
  });

  it('ignores unknown mutation type', () => {
    const initial = '<h1>title</h1>';
    document.body.innerHTML = initial;

    // @ts-ignore
    cleanup(mutate('h1', 'foo', 'hello'));
    expect(document.body.innerHTML).toEqual(initial);
  });

  it('can disconnect the global observer', async () => {
    cleanup(mutate('h1', 'setHTML', 'bar'));
    disconnectGlobalObserver();
    document.body.innerHTML = '<h1>foo</h1>';
    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
    connectGlobalObserver();
    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('<h1>bar</h1>');
  });

  it('cancels pending waitingToApply mutations when reverted', async () => {
    cleanup(mutate('h1', 'setHTML', 'bar'));
    await new Promise(res => setTimeout(res, 17));
    revertAll();
    document.body.innerHTML = '<h1>foo</h1>';
    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
  });

  it('ignores invalid setAttribute value', () => {
    document.body.innerHTML = '<h1>foo</h1>';
    cleanup(mutate('h1', 'setAttribute', 'title'));
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
    revertAll();

    cleanup(mutate('h1', 'setAttribute', '123="blah"'));
    expect(document.body.innerHTML).toEqual('<h1>foo</h1>');
  });

  it('skips checking if global MutationObserver has not added nodes', async () => {
    document.body.innerHTML = '<p>foo</p>';
    const el = document.querySelector('p');
    if (!el) return;
    await new Promise(res => setTimeout(res, 17));
    cleanup(mutate('h1', 'setHTML', 'foo'));

    el.remove();
    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('');
  });

  it('handles appending invalid html', async () => {
    document.body.innerHTML = '<div></div>';
    const el = document.querySelector('div');
    if (!el) return;
    cleanup(mutate('div', 'appendHTML', '<b>foo'));

    // Force mutation observer to fire for the element
    el.innerHTML = 'bar';
    await new Promise(res => setTimeout(res, 17));
    expect(el.innerHTML).toEqual('bar<b>foo</b>');
    revertAll();
  });

  it('handles conflicting mutations', async () => {
    document.body.innerHTML = '<div></div>';
    cleanup(mutate('div', 'setHTML', 'foo'));
    const revert2 = mutate('div', 'setHTML', 'bar');
    await new Promise(res => setTimeout(res, 17));
    expect(document.body.innerHTML).toEqual('<div>bar</div>');
    revert2();
    expect(document.body.innerHTML).toEqual('<div>foo</div>');
    revertAll();
    expect(document.body.innerHTML).toEqual('<div></div>');
  });

  it('handles multiple mutations for the same element', () => {
    document.body.innerHTML = '<div class="foo"></div>';
    cleanup(mutate('div', 'addClass', 'bar'));
    cleanup(mutate('div', 'setAttribute', 'class="baz"'));
    cleanup(mutate('div', 'addClass', 'last'));

    expect(document.body.innerHTML).toEqual('<div class="baz last"></div>');
  });

  it('supports multiple matching elements', async () => {
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');

    document.body.appendChild(div1);
    document.body.appendChild(div2);

    cleanup(mutate('div', 'addClass', 'foo'));
    expect(div1.className).toEqual('foo');
    expect(div2.className).toEqual('foo');

    const div3 = document.createElement('div');
    document.body.appendChild(div3);
    await new Promise(res => setTimeout(res, 17));
    expect(div3.className).toEqual('foo');

    div2.remove();
    await new Promise(res => setTimeout(res, 17));
  });

  it('handles empty setAttribute value', () => {
    document.body.innerHTML = '<div title="foo"></div>';
    cleanup(mutate('div', 'setAttribute', 'title=""'));
    expect(document.body.innerHTML).toEqual('<div></div>');
  });
});
