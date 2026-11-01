// Раннеры CI медленнее локальной машины: даём асинхронным ожиданиям RNTL запас.
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 });
