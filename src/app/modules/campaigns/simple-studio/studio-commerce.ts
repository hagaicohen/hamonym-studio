import type { CampaignDraft, Offering, RegistrationOption } from '../services/campaign-studio-state.service';

type Document = Record<string, any>;
export const studioRewards = (doc: Document): Document[] => doc?.['content']?.rewards?.items || [];
export const studioRaces = (doc: Document): Document[] => (doc?.['management']?.modules?.races?.items || []).flatMap((race: Document) =>
  race['useRegistrationTypes'] && Array.isArray(race['registrationTypes']) ? race['registrationTypes'] : [race]);

/** Bind on an explicit save, before the existing immutable persistence snapshot. */
export function bindStudioCommerce(doc: Document, campaign: CampaignDraft): void {
  const rewardIds=new Set<string>(), raceIds=new Set<string>();
  for (const reward of studioRewards(doc)) {
    if(!reward['businessId'] || rewardIds.has(reward['businessId']))reward['businessId']=campaign.offerings.find(row=>row.id===reward['id'] && !rewardIds.has(row.id))?.id || crypto.randomUUID();
    rewardIds.add(reward['businessId']);
  }
  for (const race of studioRaces(doc)) {
    const existing = campaign.registrationOptions.find(row => row.id === race['id'] || row.uid === race['id']);
    if(raceIds.has(race['businessId'])){race['businessId']=crypto.randomUUID();race['businessUid']=race['businessId'];}
    race['businessId'] ||= existing?.id || crypto.randomUUID();
    race['businessUid'] ||= existing?.uid || race['businessId'];
    raceIds.add(race['businessId']);
  }
}

/** Update explicitly linked items only; retain unrelated catalog records and fields. */
export function studioCommerce(doc: Document, stored: CampaignDraft): Partial<Pick<CampaignDraft, 'offerings' | 'registrationOptions'>> {
  const previous = (stored.layout.simpleStudio || {}) as Document;
  const result: Partial<Pick<CampaignDraft, 'offerings' | 'registrationOptions'>> = {};
  const rewards = studioRewards(doc), races = studioRaces(doc);
  if (rewards.length || studioRewards(previous).some(row => row['businessId'])) {
    const owned = new Set(studioRewards(previous).map(row => row['businessId']).filter(Boolean));
    const kept = new Set(rewards.map(row => row['businessId']));
    const catalog = new Map(stored.offerings.filter(row => !owned.has(row.id) || kept.has(row.id)).map(row => [row.id, row]));
    for (const item of rewards) {
      const id = String(item['businessId'] || '');
      if (!id) throw new Error('יש לשמור מחדש את התשורה כדי לקשר אותה לקטלוג.');
      const old = catalog.get(id);
      const price = Number(item['amount'] ?? old?.minimumAmount ?? 0);
      const stock = item['stockEnabled'] === undefined ? old?.stock ?? null : item['stockEnabled'] ? Number(item['quantity']) : null;
      if (!Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isInteger(stock) || stock < 0))) throw new Error('סכום ומלאי התשורה חייבים להיות תקינים.');
      catalog.set(id, { ...old, id, title: String(item['name'] || old?.title || 'תשורה'), description: String(item['description'] ?? old?.description ?? ''),
        minimumAmount: price, stock, imageUrl: /^https?:\/\//.test(String(item['image'] || '')) ? item['image'] : old?.imageUrl || null,
        featured: item['recommended'] === undefined ? old?.featured : !!item['recommended'] } as Offering);
    }
    result.offerings = [...catalog.values()];
  }
  if (races.length || studioRaces(previous).some(row => row['businessId'])) {
    const owned = new Set(studioRaces(previous).flatMap(row => [row['businessId'], row['businessUid']]).filter(Boolean));
    const kept = new Set(races.flatMap(row => [row['businessId'], row['businessUid']]));
    const options = new Map(stored.registrationOptions.filter(row => (!owned.has(row.id) && !owned.has(row.uid)) || kept.has(row.id) || kept.has(row.uid)).map(row => [row.id, row]));
    for (const item of races) {
      const id = String(item['businessId'] || '');
      const old = [...options.values()].find(row => row.id === id || row.uid === item['businessUid']);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('מזהה מסלול ההרשמה אינו תקין.');
      const price = Number(item['price'] ?? old?.price ?? 0);
      if (!Number.isFinite(price) || price < 0) throw new Error('מחיר מסלול ההרשמה אינו תקין.');
      options.set(old?.id || id, { ...old, id: old?.id || id, uid: old?.uid || item['businessUid'] || id,
        key: old?.key || id, title: String(item['title'] || item['name'] || item['distance'] || old?.title || 'הרשמה למירוץ'),
        description: String(item['description'] ?? old?.description ?? ''), price } as RegistrationOption);
    }
    result.registrationOptions = [...options.values()];
  }
  return result;
}
