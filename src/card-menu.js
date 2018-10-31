'use strict';

const expose = require('./expose');
const DOM = require('react-dom-factories');
const css = require('css');

const dialog = require('dialog');

const state = require('state');
const objectMerge = require('../object-merge.js');
const hasher = require('object-hash');
const FileSaver = require('file-saver');

module.exports = class CardMenu extends expose.Component {
	constructor(props) {
		super(props);
		this.expose();
		this.state = {};

		this.handleTeamsClick = function () {
			expose.set_state('main', {
				page: '/teams',
			});
		};

		this.handlePlayersClick = function () {
			expose.set_state('main', {
				page: '/players',
			});
		};

		this.handleLoginClick = function () {
			expose.set_state('main', {
				page: '/menu/login',
			});
		};

		this.handleSyncClick = async function () {
			let buttonDiv = document.getElementById('sync');
			buttonDiv.innerHTML = 'Sync (In Progress)';
			buttonDiv.classList.add('disabled');
			let status = await state.sync();
			if (status === 200) {
				buttonDiv.innerHTML = 'Sync (Success)';
			} else if (status === 403) {
				dialog.show_notification('Please log in');
				buttonDiv.innerHTML = 'Sync';
			} else {
				buttonDiv.innerHTML = `Sync (Fail - ${status})`;
			}
			buttonDiv.classList.remove('disabled');
		};

		this.handleSaveClick = function () {
			var today = new Date().getTime();
			var blob = new Blob([JSON.stringify(state.getLocalState(), null, 2)], { type: 'text/plain;charset=utf-8' });
			FileSaver.saveAs(blob, 'save' + today + '.json');
		};

		this.handleLoadClick = function () {
			expose.set_state('main', {
				page: '/menu/import',
			});
		};
	}

	renderMenuOptions() {
		let elems = [];

		elems.push(
			DOM.div(
				{
					key: 'teams',
					id: 'teams',
					className: 'list-item',
					onClick: this.handleTeamsClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Teams',
			),
		);

		elems.push(
			DOM.div(
				{
					key: 'players',
					id: 'players',
					className: 'list-item',
					onClick: this.handlePlayersClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Players',
			),
		);

		elems.push(
			DOM.div(
				{
					key: 'login',
					id: 'login',
					className: 'list-item',
					onClick: this.handleLoginClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Login',
			),
		);

		elems.push(
			DOM.div(
				{
					key: 'sync',
					id: 'sync',
					className: 'list-item',
					onClick: this.handleSyncClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Sync',
			),
		);

		elems.push(
			DOM.div(
				{
					key: 'save',
					className: 'list-item',
					onClick: this.handleSaveClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Save as File',
			),
		);

		elems.push(
			DOM.div(
				{
					key: 'load',
					className: 'list-item',
					onClick: this.handleLoadClick.bind(this),
					style: {
						backgroundColor: css.colors.BG,
					},
				},
				'Load from File',
			),
		);

		return DOM.div({}, elems);
	}

	render() {
		return DOM.div(
			{
				style: {},
			},
			DOM.div(
				{
					className: 'card-title',
				},
				'Menu',
			),
			this.renderMenuOptions(),
		);
	}
};
