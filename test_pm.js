const fs = require('fs');
let js = fs.readFileSync('/Users/rattikunjumuang/Desktop/test/team-manager.js', 'utf8');

// Mock DOM
const dom = {
  getElementById: (id) => ({ value: '', textContent: '', style: {}, innerHTML: '' }),
  querySelectorAll: () => [],
  querySelector: () => null
};
global.document = dom;
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = v; },
  removeItem(k) { delete this._data[k]; }
};

let toastMsg = '';
global.toast = (m) => { toastMsg = m; console.log("TOAST:", m); };

// Evaluate JS
eval(js);

// Setup mock state
let users = initUsers();
global.cu = users.find(u => u.role === 'pm');

// Mock an exercise submitted by a member
let es = [
  {
    id: 1, name: 'Member1', email: 'member1@team.com', exType: 'group_ex', type: 'group',
    activity: 'Yoga', date: '2026-05-04', status: 'pending', members: []
  }
];
saveExs(es);

console.log("Before join:");
console.log(getExs()[0].members);

joinExGroup(1);

console.log("After join:");
console.log(getExs()[0].members);

