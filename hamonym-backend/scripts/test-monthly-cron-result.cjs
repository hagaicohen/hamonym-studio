'use strict';
const assert=require('node:assert/strict');const {validateResult}=require('../src/jobs/billing-monthly-cycle.job');let n=0;
function pass(name,result,fail){if(fail){assert.throws(()=>validateResult(result),error=>result===undefined ? !!error.resultSummary : error.resultSummary===result)}else{assert.doesNotThrow(()=>validateResult(result))}console.log('PASS '+name);n++;}
for(const reason of ['cutoff_not_reached','billing_already_running','already_processed'])pass(reason+' is a healthy skip',{results:[{step:'monthly_billing',status:'skipped',result:{reason}}]},false);
pass('completed billing',{results:[{step:'monthly_billing',status:'success',result:{errors:[]}}]},false);
pass('nested lock skip',{results:[{step:'monthly_billing',status:'success'},{step:'collection',status:'skipped_locked'}]},false);
pass('blocked SQL error',{results:[{step:'monthly_billing',status:'blocked',result:{reason:'42703',diagnostic:{missingColumn:'d.is_mock'}}}]},true);
pass('failed collection',{results:[{step:'collection',status:'failed',error:'provider failure'}]},true);
pass('numeric errors even with success status',{results:[{step:'collection',status:'success',result:{errors:1}}]},true);
pass('array errors even with success status',{results:[{step:'monthly_billing',status:'success',result:{errors:[{code:'42703'}]}}]},true);
pass('invalid empty result',{results:[]},true);pass('invalid undefined result',undefined,true);
console.log(n+' PASS');
