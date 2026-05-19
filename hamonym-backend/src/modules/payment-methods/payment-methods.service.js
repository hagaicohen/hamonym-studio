const repository =
  require('./payment-methods.repository');

exports.getEntityPaymentMethod =
  async (entityId) => {

    return repository.getByEntityId(
      entityId
    );

  };

exports.createPaymentMethod =
  async (data) => {

    if (!data.entity_id) {

      throw new Error(
        'entity_id is required'
      );

    }

    if (!data.token) {

      throw new Error(
        'token is required'
      );

    }

    return repository.create(data);

  };

exports.deletePaymentMethod =
  async (id) => {

    return repository.remove(id);

  };