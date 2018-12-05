const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fork = require('child_process').fork;

describe('when one level JSON dependency is updated', () => {
  describe('and parent accepts it', () => {
    it('should call accept handler', done => {
      const child = fork('../fixtures/accept-json-children/main.js', {
        cwd: __dirname
      });

      let touched = false;
      let accepted = false;
      const depMessages = [];
      const updatedValue = +new Date();

      child.on('message', message => {
        switch (message.message) {
          case 'start':
            touched = true;
            fs.writeFileSync(
              path.join(__dirname, '../fixtures/accept-json-children/dependency.json'),
              JSON.stringify({ value: updatedValue })
            );
            break;
          case 'call from main':
            assert.equal(message.value, 42);
            break;

          case 'call from accept handler':
            if (!touched) {
              done(new Error('accepted before dependency is changed'));
            }
            accepted = true;
            child.on('exit', e => {
              assert.equal(e, 0);
              assert.equal(message.value, updatedValue);
              done();
            });
            child.send('exit');
            break;
        }
      });
    });
  });
});
