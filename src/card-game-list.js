'use strict';

const expose = require( './expose' );
const DOM = require( 'react-dom-factories' );
const css = require( 'css' );
const dialog = require( 'dialog' );

const state = require( 'state' );

module.exports = class CardGameList extends expose.Component {
	constructor( props ) {
		super( props );
		this.expose();
		this.state = {};

		this.handleGameClick = function( game ) {
			expose.set_state( 'main', {
				page: `/teams/${props.team.id}/games/${game.id}` // TODO: always back to lineup?
			} );
		};

		this.handleEditClick = function( game, ev ) {
			expose.set_state( 'main', {
				page: `/teams/${props.team.id}/games/${game.id}/edit`,
				isNew: false
			} );
			ev.stopPropagation();
		};

		this.handleCreateClick = function(){
			let game = state.addGame( this.props.team.id, '' );
			expose.set_state( 'main', {
				page: `/teams/${props.team.id}/games/${game.id}/edit`,
				isNew: true
			} );
		}.bind( this );
	}

	renderGameList(){
		let elems = this.props.team.games.map( ( game ) => {
			return DOM.div( {
				game_id: game.id,
				key: 'game' + game.id,
				className: 'list-item',
				onClick: this.handleGameClick.bind( this, game ),
				style: {
					display: 'flex',
					justifyContent: 'space-between'
				}
			},
				DOM.div( {					
					className: 'prevent-overflow'
				}, 'Vs. ' + game.opponent ),
				DOM.div( {
					style: {
					}},
					DOM.img( {
						src: '/assets/edit.svg',
						alt: 'edit',
						className: 'list-button',
						onClick: this.handleEditClick.bind( this, game ),
						alt: 'edit'
					} )
				)
			);
		} );

		elems.push( DOM.div( {
			key: 'newteam',
			className: 'list-item add-list-item',
			onClick: this.handleCreateClick,
		}, '+ Add New Game' ) );

		return DOM.div( {

		}, elems );
	}

	render() {
		return DOM.div( {
				className: 'card',
				style: {
				}
			},
			this.renderGameList()
		);
	}
};
