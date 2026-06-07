module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // hermes-stable は private フィールドの変換をスキップし、
          // Expo Go の Hermes と不整合になるため default を使用
          unstable_transformProfile: 'default',
        },
      ],
    ],
  };
};
