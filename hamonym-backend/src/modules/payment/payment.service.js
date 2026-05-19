const cardcomClient =
  require('./cardcom/cardcom.client');

const cardcomValidator =
  require('./cardcom/cardcom.validator');

exports.testCardcomConnection =
  async (config) => {

    const result =
      await cardcomClient
        .testConnection(config);

    if (!result.success) {
      return result;
    }

    return cardcomValidator
      .validateConnectionResponse(
        result.data
      );
  };