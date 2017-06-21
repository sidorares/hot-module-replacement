const assert = require('assert');
const touch = require('touch');
const path = require('path');
const fork = require('child_process').fork;

describe('when nested dependency is updated', () => {
  describe('and parent accepts dependency that depend on it', () => {
    it('should call accept handler and reload all dependencies on path', done => {
      const child = fork('../fixtures/accept-subchildren-bubble/main.js', {
        cwd: __dirname
      });

      let touched = false;
      let accepted = false;
      const depMessages = [];
      const depMessages1 = [];
      const depMessages2 = [];

      child.on('message', message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(
              path.join(
                __dirname,
                '../fixtures/accept-subchildren-bubble/dependency-level2.js'
              )
            );
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency is changed'));
            }
            accepted = true;
            child.on('exit', e => {
              assert.equal(e, 0);
              assert.equal(depMessages.length, 2);
              assert.equal(depMessages1.length, 2);
              assert.equal(depMessages2.length, 2);
              done();
            });
            child.send('exit');
            break;
          case 'call from dependency 1':
            depMessages1.push(message.param);
            if (accepted) {
              // this is second call
              assert.equal(depMessages1.length, 2);
              // and it should be from updated dependency.
              // Check time in milliseconds between calls
              // if module was NOT reloaded it should be zero
              // we expect second call to come from reloaded verion
              assert(
                (depMessages1[1][0] - depMessages1[0][0]) * 1e9 +
                  (depMessages1[1][1] - depMessages1[0][1]) >
                  0
              );
            }
            break;
          case 'call from dependency 2':
            depMessages2.push(message.param);
            if (accepted) {
              // this is second call
              assert.equal(depMessages2.length, 2);
              // and it should be from updated dependency.
              // Check time in milliseconds between calls
              // if module was NOT reloaded it should be zero
              // we expect second call to come from reloaded verion
              assert(
                (depMessages2[1][0] - depMessages2[0][0]) * 1e9 +
                  (depMessages2[1][1] - depMessages2[0][1]) >
                  0
              );
            }
            break;
          case 'call from dependency':
            depMessages.push(message.param);
            if (accepted) {
              // this is second call
              assert.equal(depMessages.length, 2);
              // and it should be from updated dependency.
              // Check time in milliseconds between calls
              // if module was NOT reloaded it should be zero
              // we expect second call to come from reloaded verion
              assert(
                (depMessages[1][0] - depMessages[0][0]) * 1e9 +
                  (depMessages[1][1] - depMessages[0][1]) >
                  0
              );
            }
            break;
        }
      });
    });
  });
});
