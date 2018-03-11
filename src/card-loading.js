'use strict';

const React = require( 'react' );
const expose = require( './expose' );
const DOM = require( 'react-dom-factories' );
const css = require( 'css' );
const Draggable = require( 'react-draggable' );

const state = require( 'state' );

module.exports = class CardLoading extends expose.Component {
	constructor( props ) {
		super( props );
		this.expose();
		this.state = {};
	}
	
	componentDidMount(){
		state.updateState(function() {
			expose.set_state( 'main', {
				page: 'TeamList'
			});
		}, false);
	}

	render() {
		return 	DOM.div( {
				style: {
				}
			},
			"Loading..."
			)
	}
};
