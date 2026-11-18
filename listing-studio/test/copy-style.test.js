import test from 'node:test';
import assert from 'node:assert/strict';
import {copyStyleSuggestions} from '../public/core.js';
test('Marketing filler and private condition grades receive advisory notes',()=>{
 for(const text of ['A standout souvenir style look.','This brings retro energy.','Tagged M with condition AB.','Grade: A'])assert.ok(copyStyleSuggestions(text).length,text);
});
test('Concrete garment details and factual Energy graphic names are retained',()=>{
 for(const text of ['Monster Energy logo printed on the front.','White crewneck with a cathedral print in red, gold, green and black.','Minor staining near the cuff.'])assert.deepEqual(copyStyleSuggestions(text),[]);
});
