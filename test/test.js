// build time tests for datalog plugin
// see http://mochajs.org/

(function() {
  const datalog = require('../client/datalog'),
        expect = require('expect.js');

  describe('datalog plugin', () => {
    describe('expand', () => {
      it('can make itallic', () => {
        var result = datalog.expand('hello *world*');
        return expect(result).to.be('hello <i>world</i>');
      });
    });
  });

}).call(this);
