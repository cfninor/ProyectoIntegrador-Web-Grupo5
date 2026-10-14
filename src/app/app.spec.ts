import { render } from '@testing-library/angular';

import { App } from './app';

describe('App', () => {
  it('solo contiene el router-outlet: el encabezado es de cada layout', async () => {
    const { container } = await render(App);

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('ROUTER-OUTLET');
  });
});
