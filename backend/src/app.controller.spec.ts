import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  // Health endpoint requires live Postgres/Redis; covered by e2e tests.
  it('should be defined', () => {
    expect(new AppController()).toBeDefined();
  });

  it('AppService should be defined', () => {
    expect(new AppService()).toBeDefined();
  });
});
