exports.validateConnectionResponse =
  (response) => {

    if (!response) {

      return {
        success: false,
        status: 'failed',
        message: 'Empty response'
      };
    }

    if (response.ResponseCode === 0) {

      return {
        success: true,
        status: 'connected',
        message: 'CardCom connected successfully'
      };
    }

    return {
      success: false,
      status: 'failed',
      code: response.ResponseCode,
      message:
        response.Description ||
        'CardCom connection failed'
    };
  };