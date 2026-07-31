// src/modules/entities/entities.controller.js

const service =
  require('./entities.service');

// =========================================================
// CREATE ENTITY
// =========================================================

exports.createEntity =
  async (req, res) => {

    try {

      const entity =
        await service.createEntity({

          userId:
            req.user.id,

          data:
            req.body

        });

      res.json({
        entity
      });

    } catch (err) {

        console.error(err);

        // ========================================
        // DUPLICATE REGISTRATION NUMBER
        // ========================================

        if (
          err.code === '23505'
        ) {

          return res
            .status(409)
            .json({

              success: false,

              message:
                'מספר רישום כבר קיים במערכת'

            });

        }

        res.status(500).json({

          success: false,

          error:
            'Failed to create entity'

        });

      }

  };

// =========================================================
// GET MY ENTITIES
// =========================================================

exports.getMyEntities =
  async (req, res) => {

    try {

      const entities =
        await service.getMyEntities(

          req.user.id

        );

      res.json({
        entities
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to fetch entities'
      });

    }

  };

// =========================================================
// UPLOAD ASSOCIATION DOCUMENT
// =========================================================

exports.uploadAssociationDocument =
  async (req, res) => {

    try {

      const result =
        await service
          .uploadAssociationDocument({

            entityId:
              req.params.id,

            file:
              req.file

          });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload association document'
      });

    }

  };

// =========================================================
// UPLOAD TAX DOCUMENT
// =========================================================

exports.uploadTaxDocument =
  async (req, res) => {

    try {

      const result =
        await service
          .uploadTaxDocument({

            entityId:
              req.params.id,

            file:
              req.file

          });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload tax document'
      });

    }

  };

// =========================================================
// GET ASSOCIATION DOCUMENT
// =========================================================

exports.getAssociationDocument =
  async (req, res) => {

    try {

      const file =
        await service
          .getAssociationDocument(

            req.params.id

          );

      if (!file) {

        return res
          .status(404)
          .send('File not found');

      }

      res.setHeader(

        'Content-Type',

        file.association_certificate_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${file.association_certificate_name}"`

      );

      res.send(

        file.association_certificate_data

      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch file'
      );

    }

  };

// =========================================================
// GET TAX DOCUMENT
// =========================================================

exports.getTaxDocument =
  async (req, res) => {

    try {

      const file =
        await service
          .getTaxDocument(

            req.params.id

          );

      if (!file) {

        return res
          .status(404)
          .send('File not found');

      }

      res.setHeader(

        'Content-Type',

        file.tax_document_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${file.tax_document_name}"`

      );

      res.send(

        file.tax_document_data

      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch file'
      );

    }

  };

// =========================================================
// UPLOAD LOGO
// =========================================================

exports.uploadLogo =
  async (req, res) => {

    try {

      const result =
        await service.uploadLogo({

          entityId:
            req.params.id,

          file:
            req.file

        });

      res.json({
        result
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to upload logo'
      });

    }

  };

// =========================================================
// GET LOGO
// =========================================================

/*exports.getLogo =
  async (req, res) => {

    try {

      const logo =
        await service.getLogo(

          req.params.id

        );

      if (
        !logo ||
        !logo.logo_data
      ) {

        return res
          .status(404)
          .send('Logo not found');

      }

      res.setHeader(

        'Content-Type',

        logo.logo_mime

      );

      res.send(
        logo.logo_data
      );

    } catch (err) {

      console.error(err);

      res.status(500).send(
        'Failed to fetch logo'
      );

    }

  };*/

// =========================================================
// UPDATE ENTITY
// =========================================================
exports.getEntityById =
  async (req, res) => {

    try {

      const entity =

        await service
          .getEntityById(
            req.params.id
          );

      if (!entity) {

        return res
          .status(404)
          .json({
            error:
              'Entity not found'
          });

      }

      res.json(entity);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to get entity'
      });

    }

  };

exports.updateEntity =

  async (req, res) => {

    
    try {

      const entity =
        await service.updateEntity({

          entityId:
            req.params.id,

          userId:
            req.user.id,

          data:
            req.body

        });

      res.json(entity);

    } catch (err) {

      console.error(err);

      const status = err.message === 'Unauthorized' ? 403 : 500;
      res.status(status).json({
        error:
          status === 403 ? err.message : 'Failed to update entity'
      });

    }

  };

// =========================================================
// REMOVE TAX DOCUMENT
// =========================================================

exports.removeTaxDocument =
  async (req, res) => {

    try {

      await service
        .removeTaxDocument(

          req.params.id

        );

      res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error:
          'Failed to remove tax document'
      });

    }

  };

exports.removeAssociationDocument =
  async (req, res) => {
    try {
      await service.removeAssociationDocument(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to remove association document' });
    }
  };

// =========================================================
// APPROVAL STATUS
// =========================================================

function statusForApproval(err) {
  switch (err.message) {
    case 'Unauthorized': return 403;
    case 'Invalid transition': return 409;
    default: return 500;
  }
}

exports.getApprovalStatus = async (req, res) => {
  try {
    const result = await service.getApprovalStatus(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(statusForApproval(err)).json({ error: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await service.getNotifications(req.params.id, req.user.id);
    res.json({ notifications });
  } catch (err) {
    res.status(statusForApproval(err)).json({ error: err.message });
  }
};

exports.acknowledgeNotifications = async (req, res) => {
  try {
    await service.acknowledgeNotifications(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(statusForApproval(err)).json({ error: err.message });
  }
};

exports.requestReview = async (req, res) => {
  try {
    const entity = await service.requestReview(req.params.id, req.user.id);
    res.json({ entity });
  } catch (err) {
    res.status(statusForApproval(err)).json({ error: err.message });
  }
};

exports.softDeleteEntity = async (req, res) => {
  try {
    const entity = await service.softDeleteEntity(req.params.id, req.user.id);
    res.json({ success: true, entity });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 403
      : err.message === 'Entity not found or already deleted' ? 404
      : 500;
    res.status(status).json({ error: err.message });
  }
};

exports.setEntityVisibility = async (req, res) => {
  try {
    const isHidden = req.body.is_hidden === true;
    const entity = await service.setEntityVisibility(req.params.id, req.user.id, isHidden);
    res.json({ success: true, entity });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 403
      : err.message === 'Entity not found' ? 404
      : 500;
    res.status(status).json({ error: err.message });
  }
};
// =========================================================
// ENTITY ROLES (Partner Domain Model — Phase 2)
// =========================================================
// Ownership already checked by requireEntityOwnership() on these routes.

exports.getRoles = async (req, res) => {
  try {
    const roles = await service.getRoles(req.params.id);
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['organization', 'partner'].includes(role)) {
      return res.status(400).json({ error: `Unknown role: ${role}` });
    }
    const roles = await service.addRole(req.params.id, role);
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.removeRole = async (req, res) => {
  try {
    const roles = await service.removeRole(req.params.id, req.params.role);
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// =========================================================
// PARTNER DRAFT (Page Builder Owner Context — Phase 3)
// =========================================================
// Ownership already checked by requireEntityOwnership() on these routes.

exports.getDraft = async (req, res) => {
  try {
    const draft = await service.getDraft(req.params.id);
    res.json(draft);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.updateDraft = async (req, res) => {
  try {
    const draft = await service.updateDraft(req.params.id, req.body);
    res.json(draft);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// =========================================================
// PARTNER SEARCH (Phase 4 — Partner Management, Discovery)
// =========================================================

exports.searchPartners = async (req, res) => {
  try {
    const partners = await service.searchPartners(req.query.q);
    res.json({ partners });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// =========================================================
// PARTNER INVITE (Phase 4 — Partner Management, Epic 3)
// =========================================================

exports.createInvite = async (req, res) => {
  try {
    const partnerInvitesService = require('../partner-invites/partner-invites.service');
    const result = await partnerInvitesService.createInvite(req.user.id, req.params.id, req.body.email);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// =========================================================
// PUBLIC PARTNER PAGE (Phase 5, Sprint 5.1)
// =========================================================

exports.getPublicPartner = async (req, res) => {
  try {
    const partner = await service.getPublicPartner(req.params.id);
    res.json(partner);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
