const { google } = require('googleapis');
const { auth } = require('./gcpAuth');

const crm = google.cloudresourcemanager({ version: 'v1', auth });
const iam = google.iam({ version: 'v1', auth });
const bigquery = google.bigquery({ version: 'v2', auth });

module.exports = {
  crm, iam, bigquery,
};
