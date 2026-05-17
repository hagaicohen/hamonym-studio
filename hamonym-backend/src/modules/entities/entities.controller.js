const service =
  require('./entities.service');

exports.createEntity =
  async (req, res) => {

    try {

      return res.status(201).json({

        success: true,

        entity

      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed creating entity'

      });

    }

  };

exports.getMyEntities =
  async (req, res) => {

    try {

      const entities =
        await service.getMyEntities(

          req.user.id

        );

      return res.json({

        success: true,

        entities

      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed loading entities'

      });

    }

  };

exports.uploadAssociationDocument =
  async (req, res) => {

    try {

      const result =
        await service.uploadAssociationDocument({

          entityId:
            req.params.id,

          file:
            req.file

        });

      return res.json({

        success: true,

        result

      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed uploading association document'

      });

    }

  };

exports.uploadTaxDocument =
  async (req, res) => {

    try {

      const result =
        await service.uploadTaxDocument({

          entityId:
            req.params.id,

          file:
            req.file

        });

      return res.json({

        success: true,

        result

      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed uploading tax document'

      });

    }

  };

exports.getAssociationDocument =
  async (req, res) => {

    try {

      const document =
        await service.getAssociationDocument(

          req.params.id

        );

      if (!document) {

        return res.status(404).json({

          success: false,

          message:
            'Document not found'

        });

      }

      res.setHeader(

        'Content-Type',

        document.association_certificate_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${document.association_certificate_name}"`

      );

      return res.send(

        document.association_certificate_data

      );

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed loading document'

      });

    }

  };

exports.getTaxDocument =
  async (req, res) => {

    try {

      const document =
        await service.getTaxDocument(

          req.params.id

        );

      if (!document) {

        return res.status(404).json({

          success: false,

          message:
            'Document not found'

        });

      }

      res.setHeader(

        'Content-Type',

        document.tax_document_mime

      );

      res.setHeader(

        'Content-Disposition',

        `inline; filename="${document.tax_document_name}"`

      );

      return res.send(

        document.tax_document_data

      );

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed loading document'

      });

    }

};

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

      return res.json({

        success: true,

        result

      });

    } catch (err) {

      console.error(err);

      return res.status(500).json({ 

        success: false,

        message:
          'Failed uploading logo'

      });

    }

};

exports.getLogo =
  async (req, res) => {

    try {

      const logo =
        await service.getLogo(

          req.params.id

        );

      if (!logo) {

        return res.status(404).json({

          success: false,

          message:
            'Logo not found'

        });

      }

      res.setHeader(

        'Content-Type',

        logo.logo_mime

      );

      return res.send(

        logo.logo_data

      );

    } catch (err) {

      console.error(err);

      return res.status(500).json({

        success: false,

        message:
          'Failed loading logo'

      });

    }

  };