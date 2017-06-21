const assert = require('assert');
const touch = require('touch');
const path = require('path');
const fork = require('child_process').fork;

describe('when one level dependency is updated', () => {
  describe('and parent accepts it', () => {
    it('should call accept handler', done => {
      const child = fork('../fixtures/accept-children/main.js', {
        cwd: __dirname
      });

      let touched = false;
      let accepted = false;
      const depMessages = [];

      child.on('message', message => {
        switch (message.message) {
          case 'start':
            touched = true;
            touch.sync(
              path.join(__dirname, '../fixtures/accept-children/dependency.js')
            );
            break;
          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency is changed'));
            }
            accepted = true;
            child.on('exit', e => {
              assert.equal(e, 0);
              done();
            });
            child.send('exit');
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
