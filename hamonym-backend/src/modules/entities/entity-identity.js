const TYPES = Object.freeze({association:'association_number',chalatz:'company_number',political_party_new:'party_number',political_party_registered:'party_number',sole_exempt:'business_number',sole_registered:'business_number'});
const MESSAGE = 'מספר הזיהוי הזה כבר רשום במערכת. לא ניתן ליצור גוף נוסף עם אותו מספר.';
function normalize(value) { return String(value ?? '').replace(/[\s\u200B-\u200D\uFEFF\-\u2010-\u2015\u2212]/g,'') || null; }
function scope(type) {
 const identifierType=TYPES[type];
 if(!identifierType)throw Object.assign(new Error('Unsupported entity type'),{status:400,code:'INVALID_IDENTIFIER_SCOPE'});
 return {jurisdiction:'IL',identifierType};
}
const isDuplicate = error => error.code === 'DUPLICATE_LEGAL_IDENTIFIER' ||
 (error.code === '23505' && ['entities_legal_identity_unique','entities_registration_number_key'].includes(error.constraint));
async function availability(db,{userId,entityType,registrationNumber,excludeEntityId,canManagePlatform=false}) {
 const {jurisdiction,identifierType}=scope(entityType), number=normalize(registrationNumber);
 if(excludeEntityId) {
  const membership=await db.query('SELECT 1 FROM user_entities WHERE user_id=$1 AND entity_id=$2',[userId,excludeEntityId]);
  if(!membership.rows.length)throw Object.assign(new Error('Unauthorized'),{status:403});
 }
 if(!number)return {available:true}; // No new requirement for currently optional identifiers.
 const result=await db.query(`SELECT e.id, EXISTS(SELECT 1 FROM user_entities ue WHERE ue.entity_id=e.id AND ue.user_id=$4) AS can_manage
  FROM entities e WHERE e.deleted_at IS NULL AND e.registration_jurisdiction=$1 AND e.identifier_type=$2
  AND e.normalized_registration_number=$3 AND ($5::text IS NULL OR e.id::text!=$5::text) LIMIT 1`,
  [jurisdiction,identifierType,number,userId,excludeEntityId||null]);
 const row=result.rows[0];
 return row ? {available:false,...(row.can_manage || canManagePlatform?{existingEntityId:row.id,managementScope:row.can_manage?'entity':'platform'}:{})} : {available:true};
}
async function assertAvailable(db,args) {
 const result=await availability(db,args);
 if(!result.available)throw Object.assign(new Error(MESSAGE),{status:409,code:'DUPLICATE_LEGAL_IDENTIFIER',existingEntityId:result.existingEntityId});
}
function duplicateResponse(error) {
 return {error:MESSAGE,code:'DUPLICATE_LEGAL_IDENTIFIER',...(error.existingEntityId?{existingEntityId:error.existingEntityId}:{})};
}
module.exports={normalize,scope,availability,assertAvailable,isDuplicate,duplicateResponse};
