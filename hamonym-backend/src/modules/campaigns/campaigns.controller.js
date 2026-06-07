const service =
  require('./campaigns.service');

function getStatusCode(
  error
) {

  switch (error.message) {

    case 'Unauthorized':
      return 403;

    case 'Campaign not found':
      return 404;

    case 'Slug is required':
    case 'Title is required':
    case 'Entity ID is required':
    case 'No fields supplied':
      return 400;

    case 'Campaign slug already exists':
      return 409;

    default:
      return 500;

  }

}

function getErrorMessage(
  error
) {

  switch (error.message) {

    case 'Unauthorized':
      return 'אין לך הרשאה לבצע פעולה זו';

    case 'Campaign not found':
      return 'הקמפיין לא נמצא';

    case 'Slug is required':
      return 'יש להזין כתובת קמפיין';

    case 'Title is required':
      return 'יש להזין שם קמפיין';

    case 'Entity ID is required':
      return 'יש לבחור עמותה';

    case 'No fields supplied':
      return 'לא נשלחו נתונים לעדכון';

    case 'Campaign slug already exists':
      return 'כתובת הקמפיין כבר קיימת';

    default:
      return 'אירעה שגיאה בלתי צפויה';

  }

}

exports.createCampaign =
  async (req, res) => {

    try {

      const campaign =
        await service.createCampaign({

          userId:
            req.user.id,

          data:
            req.body

        });

      res.json(
        campaign
      );

    } catch (err) {

      console.error(err);

      res
        .status(
          getStatusCode(err)
        )
        .json({

          error:
            getErrorMessage(err)

        });

    }

  };

exports.getMyCampaigns =
  async (req, res) => {

    try {

      const campaigns =
        await service.getMyCampaigns(

          req.user.id

        );

      res.json({

        campaigns

      });

    } catch (err) {

      console.error(err);

      res
        .status(
          getStatusCode(err)
        )
        .json({

          error:
            getErrorMessage(err)

        });

    }

  };

exports.getCampaignById =
  async (req, res) => {

    try {

      const campaign =
        await service.getCampaignById({

          userId:
            req.user.id,

          campaignId:
            req.params.id

        });

      res.json(
        campaign
      );

    } catch (err) {

      console.error(err);

      res
        .status(
          getStatusCode(err)
        )
        .json({

          error:
            getErrorMessage(err)

        });

    }

  };

exports.updateCampaign =
  async (req, res) => {

    try {

      const campaign =
        await service.updateCampaign({

          userId:
            req.user.id,

          campaignId:
            req.params.id,

          data:
            req.body

        });

      res.json(
        campaign
      );

    } catch (err) {

      console.error(err);

      res
        .status(
          getStatusCode(err)
        )
        .json({

          error:
            getErrorMessage(err)

        });

    }

  };

exports.getCampaignBySlug =
  async (req, res) => {

    try {

      const campaign =
        await service.getCampaignBySlug({

          userId:
            req.user.id,

          slug:
            req.params.slug

        });

      if (!campaign) {
        return res
          .status(404)
          .json({ error: 'הקמפיין לא נמצא' });
      }

      res.json(campaign);

    } catch (err) {

      console.error(err);

      res
        .status(500)
        .json({ error: 'אירעה שגיאה בלתי צפויה' });

    }

  };

exports.checkSlugAvailable =
  async (req, res) => {

    try {

      const {
        slug,
        excludeId
      } = req.query;

      if (!slug || slug.trim().length < 3) {
        return res
          .status(400)
          .json({ error: 'slug קצר מדי' });
      }

      const available =
        await service.checkSlugAvailable({
          slug: slug.trim().toLowerCase(),
          excludeId: excludeId || null
        });

      res.json({ available });

    } catch (err) {

      console.error(err);

      res
        .status(500)
        .json({ error: 'אירעה שגיאה בלתי צפויה' });

    }

  };

exports.deleteCampaign =
  async (req, res) => {

    try {

      await service.deleteCampaign({

        userId:
          req.user.id,

        campaignId:
          req.params.id

      });

      res.json({

        success: true

      });

    } catch (err) {

      console.error(err);

      res
        .status(
          getStatusCode(err)
        )
        .json({

          error:
            getErrorMessage(err)

        });

    }

  };