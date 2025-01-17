import expose from 'expose';
import DOM from 'react-dom-factories';

export default class FloatingPicklist extends expose.Component {
  constructor(props) {
    super(props);
    this.expose();
    this.state = {};

    this.onChangeWraper = function() {
      let value = document.getElementById(this.props.id).value;
      this.props.onChange(value);
    };
  }

  componentDidMount() {
    const floatContainer = document.getElementById(this.props.id + 'container');

    if (floatContainer.querySelector('select').value) {
      floatContainer.classList.add('active');
    }

    const handleFocus = e => {
      const target = e.target;
      target.parentNode.classList.add('active');
    };

    const handleBlur = e => {
      const target = e.target;
      if (!target.value) {
        target.parentNode.classList.remove('active');
      }
      target.removeAttribute('placeholder');
    };

    const floatField = floatContainer.querySelector('select');
    floatField.addEventListener('focus', handleFocus);
    floatField.addEventListener('blur', handleBlur);

    // Setting value on the select box seems to lock the select box to the value we set. So we'll edit it here.
    document.getElementById(this.props.id).value = this.props.defaultValue;

    if (this.props.disabled === true) {
      document.getElementById(this.props.id).disabled = true;
    }
  }

  render() {
    return DOM.div(
      {
        key: this.props.id + 'container',
        id: this.props.id + 'container',
        className: 'float-container',
      },
      DOM.label({}, this.props.label),
      DOM.select(
        {
          id: this.props.id,
          onChange: this.onChangeWraper.bind(this),
          className: 'select',
        },
        // TODO: this needs to be broken out into a prop when we need this for more than just lineupType
        // TODO: tie these values to the snum in the state (LINEUP_TYPE_ENUM)
        [
          DOM.option({ key: 'normal', value: 1 }, 'Normal'),
          DOM.option({ key: 'alternate', value: 2 }, 'Alternating Gender'),
          DOM.option(
            { key: 'noConsecutive', value: 3 },
            'No Consecutive Females'
          ),
        ]
      )
    );
  }
}
