'use strict';
const proposals=require('./masav-proposal.service');
const exporter=require('./masav-export.service');
const guards={checkMasavMandate:proposals.checkMasavMandate,findUnresolvedAttempt:proposals.findUnresolvedAttempt,hasExportedMasavProposal:proposals.hasExportedMasavProposal};
exports.summary=()=>exporter.execute({oneClick:true,previewOnly:true},guards);
exports.approveAndDownload=options=>exporter.execute({...options,oneClick:true,previewOnly:false},guards);
