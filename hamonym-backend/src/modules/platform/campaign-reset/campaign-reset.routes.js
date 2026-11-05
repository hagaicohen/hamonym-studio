'use strict';
const router=require('express').Router();
const requireSuperAdmin=require('../../../middleware/require-super-admin');
const service=require('../../billing-engine/campaign-test-reset.service');
router.use(requireSuperAdmin);
router.get('/:id/status',async(req,res)=>{
 try{res.json({status:await service.preview(req.params.id)});}catch(err){res.status(err.status||503).json({code:err.code,error:err.message});}
});
router.post('/:id/reset',async(req,res)=>{
 try{res.json({result:await service.reset(req.params.id,req.body,req.user.id)});}catch(err){res.status(err.status||503).json({code:err.code,error:err.message});}
});
module.exports=router;
