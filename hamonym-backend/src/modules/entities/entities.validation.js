// src/modules/entities/entities.validation.js

exports.validateCreateEntity =
  (data) => {

    if (!data.entity_type) {
      throw new Error('type required');
    }

    if (!data.legal_name) {
      throw new Error('legal_name required');
    }

    if (!data.display_name) {
      throw new Error('display_name required');
    }

  };