import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import touch from 'touch';
import {
  esmHooksSupported,
  forkEsmFixture,
  hrtimeIncreased
} from './helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function describeIfSupported(title, fn) {
  if (esmHooksSupported) {
    describe(title, fn);
  } else {
    describe.skip(`${title} (requires Node >= 22.15 with registerHooks)`, fn);
  }
}

describeIfSupported('ESM hot module replacement', () => {
  describe('direct dependency', () => {
    it('calls accept handler when a watched dependency changes', done => {
      const fixture = path.join(__dirname, '../../fixtures/esm/direct-dep/main.mjs');
      let touched = false;
      let accepted = false;
      const depMessages = [];

      const child = forkEsmFixture(fixture, message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(path.join(__dirname, '../../fixtures/esm/direct-dep/dependency.js'));
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency changed'));
              return;
            }
            accepted = true;
            child.on('exit', code => {
              assert.strictEqual(code, 0);
              done();
            });
            child.send('exit');
            break;
          case 'call from dependency':
            depMessages.push(message.param);
            if (accepted) {
              assert.strictEqual(depMessages.length, 2);
              assert.ok(hrtimeIncreased(depMessages[0], depMessages[1]));
            }
            break;
          default:
            break;
        }
      }, {
        onError: err => done(err),
        onExit: (code, signal) => {
          if (!accepted && (code !== 0 && code !== null || signal)) {
            done(new Error(`fixture exited early: code=${code} signal=${signal}\n${child.getStderr()}`));
          }
        }
      });
    });
  });

  describe('sub-dependency bubble', () => {
    it('reloads the dependency chain when a nested file changes', done => {
      const fixture = path.join(__dirname, '../../fixtures/esm/sub-dep/main.mjs');
      let touched = false;
      let accepted = false;
      const depMessages = [];
      const depMessages1 = [];
      const depMessages2 = [];

      const child = forkEsmFixture(fixture, message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(
              path.join(__dirname, '../../fixtures/esm/sub-dep/dependency-level2.js')
            );
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency changed'));
              return;
            }
            accepted = true;
            child.on('exit', code => {
              assert.strictEqual(code, 0);
              assert.strictEqual(depMessages.length, 2);
              assert.strictEqual(depMessages1.length, 2);
              assert.strictEqual(depMessages2.length, 2);
              done();
            });
            child.send('exit');
            break;
          case 'call from dependency 1':
            depMessages1.push(message.param);
            if (accepted) {
              assert.strictEqual(depMessages1.length, 2);
              assert.ok(hrtimeIncreased(depMessages1[0], depMessages1[1]));
            }
            break;
          case 'call from dependency 2':
            depMessages2.push(message.param);
            if (accepted) {
              assert.strictEqual(depMessages2.length, 2);
              assert.ok(hrtimeIncreased(depMessages2[0], depMessages2[1]));
            }
            break;
          case 'call from dependency':
            depMessages.push(message.param);
            if (accepted) {
              assert.strictEqual(depMessages.length, 2);
              assert.ok(hrtimeIncreased(depMessages[0], depMessages[1]));
            }
            break;
          default:
            break;
        }
      });
    });
  });

  describe('mixed default and named import', () => {
    it('refreshes both bindings after accept', done => {
      const fixture = path.join(__dirname, '../../fixtures/esm/mixed-import/main.mjs');
      let touched = false;
      let accepted = false;
      const valueSnapshots = [];

      const child = forkEsmFixture(fixture, message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(path.join(__dirname, '../../fixtures/esm/mixed-import/routes.js'));
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency changed'));
              return;
            }
            accepted = true;
            child.on('exit', code => {
              assert.strictEqual(code, 0);
              assert.strictEqual(valueSnapshots.length, 2);
              assert.ok(hrtimeIncreased([0, valueSnapshots[0].a], [0, valueSnapshots[1].a]));
              assert.strictEqual(valueSnapshots[0].hasRoutes, true);
              assert.strictEqual(valueSnapshots[1].hasRoutes, true);
              done();
            });
            child.send('exit');
            break;
          case 'values':
            valueSnapshots.push(message);
            break;
          default:
            break;
        }
      }, {
        onError: err => done(err),
        onExit: (code, signal) => {
          if (!accepted && (code !== 0 && code !== null || signal)) {
            done(new Error(`fixture exited early: code=${code} signal=${signal}\n${child.getStderr()}`));
          }
        }
      });
    });
  });

  describe('circular dependencies', () => {
    it('accepts an update across a circular import graph', done => {
      const fixture = path.join(__dirname, '../../fixtures/esm/circular/main.mjs');
      let touched = false;
      let accepted = false;
      const aMessages = [];

      const child = forkEsmFixture(fixture, message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(path.join(__dirname, '../../fixtures/esm/circular/a.js'));
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency changed'));
              return;
            }
            accepted = true;
            child.on('exit', code => {
              assert.strictEqual(code, 0);
              assert.ok(aMessages.length >= 2);
              done();
            });
            child.send('exit');
            break;
          case 'call from a':
            aMessages.push(message.param);
            break;
          default:
            break;
        }
      });
    });
  });
});
