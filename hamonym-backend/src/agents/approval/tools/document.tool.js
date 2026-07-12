const entitiesService = require('../../../modules/entities/entities.service');

// Uses the metadata-only variants — pulling the actual blob bytes over the
// wire just to discard them was the single slowest step in the whole agent
// pipeline (~24s on a degraded connection, caught by trace.util.js).
exports.loadDocuments = async (entityId) => {
  const [association, tax] = await Promise.all([
    entitiesService.getAssociationDocumentMeta(entityId),
    entitiesService.getTaxDocumentMeta(entityId),
  ]);

  return [
    {
      type: 'association_certificate',
      name: association?.association_certificate_name || null,
      mime: association?.association_certificate_mime || null,
      hasData: !!association?.has_data,
    },
    {
      type: 'tax_document',
      name: tax?.tax_document_name || null,
      mime: tax?.tax_document_mime || null,
      hasData: !!tax?.has_data,
    },
  ];
};
