/**
 * Baobab Cursor Combination
 * ==========================
 *
 * A useful abstraction dealing with cursor's update logical combinations.
 */
var EventEmitter = require('emmett'),
    helpers = require('./helpers.js'),
    type = require('./type.js');

/**
 * Utilities
 */
function bindCursor(c, cursor) {
  cursor.on('update', c.cursorListener);
  c.tree.off('update', c.treeListener);
  c.tree.on('update', c.treeListener);
}

/**
 * Main Class
 */
function Combination(operator /*, &cursors */) {
  var self = this;

  // Safeguard
  if (arguments.length < 2)
    throw Error('baobab.Combination: not enough arguments.');

  var first = arguments[1],
      rest = helpers.arrayOf(arguments).slice(2);

  if (first instanceof Array) {
    rest = first.slice(1);
    first = first[0];
  }

  if (!type.Cursor(first))
    throw Error('baobab.Combination: argument should be a cursor.');

  if (operator !== 'or' && operator !== 'and')
    throw Error('baobab.Combination: invalid operator.');

  // Extending event emitter
  EventEmitter.call(this);

  // Properties
  this.cursors = [first];
  this.operators = [];
  this.tree = first.tree;

  // State
  this.updates = new Array(this.cursors.length);

  // Listeners
  this.cursorListener = function() {
    self.updates[self.cursors.indexOf(this)] = true;
  };

  this.treeListener = function() {
    var shouldFire = self.updates[0],
        i,
        l;

    for (i = 1, l = self.cursors.length; i < l; i++) {
      shouldFire = self.operators[i - 1] === 'or' ?
        shouldFire || self.updates[i] :
        shouldFire && self.updates[i];
    }

    if (shouldFire)
      self.emit('update');

    // Waiting for next update
    self.updates = new Array(self.cursors.length);
  };

  // Lazy binding
  this.bound = false;

  var regularOn = this.on,
      regularOnce = this.once;

  var lazyBind = function() {
    if (self.bound)
      return;
    self.bound = true;
    self.cursors.forEach(function(cursor) {
      bindCursor(self, cursor);
    });
  };

  this.on = function() {
    lazyBind();
    return regularOn.apply(this, arguments);
  };

  this.once = function() {
    lazyBind();
    return regularOnce.apply(this, arguments);
  };

  // Attaching any other passed cursors
  rest.forEach(function(cursor) {
    this[operator](cursor);
  }, this);
}

helpers.inherits(Combination, EventEmitter);

/**
 * Prototype
 */
function makeOperator(operator) {
  Combination.prototype[operator] = function(cursor) {

    // Safeguard
    if (!type.Cursor(cursor)) {
      this.release();
      throw Error('baobab.Combination.' + operator + ': argument should be a cursor.');
    }

    if (~this.cursors.indexOf(cursor)) {
      this.release();
      throw Error('baobab.Combination.' + operator + ': cursor already in combination.');
    }

    this.cursors.push(cursor);
    this.operators.push(operator);
    this.updates.length++;

    if (this.bound)
      bindCursor(this, cursor);

    return this;
  };
}

makeOperator('or');
makeOperator('and');

Combination.prototype.release = function() {

  // Dropping cursors listeners
  this.cursors.forEach(function(cursor) {
    cursor.off('update', this.cursorListener);
  }, this);

  // Dropping tree listener
  this.tree.off('update', this.treeListener);

  // Cleaning
  this.cursors = null;
  this.operators = null;
  this.tree = null;
  this.updates = null;

  // Dropping own listeners
  this.kill();
};

/**
 * Exporting
 */
module.exports = Combination;
