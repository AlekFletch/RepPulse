const router = {
  __last: null,
  replace: function (options) {
    router.__last = options;
  }
};

export default router;
