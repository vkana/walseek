import React, {Component} from 'react';
import './App.css';
import logo from './logo.svg';
const axios = require('axios');
const stores = require('./stores.json');
//===============
const secrets = require('./secrets.json');
const apiKey = secrets.apiKey;
const walmart = require('walmart')(apiKey);

let allStores = stores.allStores;
let failedStores = [];

const getUPC = async (sku) => {
  const apiKey = secrets.apiKey;
  const url = `http://api.walmartlabs.com/v1/items/${sku}?apiKey=${apiKey}`;
  let resp = await axios.get(url);
  return resp.data.upc;
};

const getPrice = (response => {
  let priceObj = {
    "no": 0,
    "price": 9999,
    "stock": "NA"
  };
  if (response && response.data && response.data.data && response.data.data.inStore) {
    priceObj = {
      "no": response.data.data.inStore.storeId,
      "price": response.data.data.inStore.price.priceInCents / 100,
      "stock": response.data.data.inStore.inventory ? response.data.data.inStore.inventory.status : 'NA'
    };
    //priceObj.stock = response.data.data.inStore.inventory ? response.data.data.inStore.inventory.status : 'NA';
  }
  return priceObj;
});

const productDetails = (result) => {
  return {
    name: result.data.data.common.name,
    sku: result.data.data.common.productId.wwwItemId,
    upc: result.data.data.common.productId.upca,
    url: result.data.data.common.productUrl,
    bsUrl: 'https://www.brickseek.com/walmart-inventory-checker?sku=' + result.data.data.common.productId.wwwItemId,
    available: result.data.data.common.offerType
  };
}

const getStore = storeId => {return allStores.filter(st => st.no === storeId)[0]};

const getStorePricePromise = (upc, storeId) => {
  let url = `https://search.mobile.walmart.com/v1/products-by-code/UPC/${upc}`;
  return axios.get(url, {
    params: {
      storeId: storeId
    }
  }).catch(e => {
    failedStores.push(storeId);
    return e;
  })
};


//===============
class App extends Component {
  constructor() {
    super();
    this.state = {
      upc: '',
      storePrices: [],
      product: {name: '', sku: '', upc: ''},
      progress: ''
    }

    this.handleChange = this.handleChange.bind(this);
    this.searchStores = this.searchStores.bind(this);
  }

  searchStores = async (upc, zip) => {
    let lowPrice = 9999;

    if (zip) {
      allStores = await walmart.stores.byZip(zip);
    };

    let concurrent = 500;
    let product = null;

    if (upc.length < 12) {
      upc = await getUPC(upc);
    }
    const storeCount = allStores.length;
    let promiseArray = [];

    for (let i = 0; i < storeCount; i++) {
      let storeId = allStores[i].no;
      promiseArray.push(getStorePricePromise(upc, storeId));

      if ((i % concurrent === 0 || i === storeCount - 1)) {
        this.setState({progress: 'Searching ' + i + ' of ' + storeCount});
        try {
          let results = await Promise.all(promiseArray);
          if (!product) {
            product = productDetails(results[0]);
            this.setState({product: product});
          };
          results.map(r => {
            let priceObj = getPrice(r);
            if (priceObj.no !== 0 && (priceObj.price <= lowPrice || allStores.length < 100)) {
              let store = getStore(priceObj.no);
              priceObj.zip = '00000'.concat(store.zip).substr(-5);
              priceObj.address = store.address || store.streetAddress;
              zip = priceObj.zip;
              let storePrices = this.state.storePrices;
              storePrices.unshift(priceObj);
              this.setState({storePrices: storePrices});
              lowPrice = priceObj.price;
            }
          });
          promiseArray = [];

        } catch (e) {
          console.log('errored', e.code || (e.response ? e.response.status : '') || e);
        }
      }
    }
    this.setState({progress: 'Done. Skipped ' + failedStores.length + ' stores'});
    document.getElementById('progressIcon').class = 'App-logo-paused';
  }

  handleChange(event) {
    this.setState({
      upc: event.target.value,
      storePrices: []
    });
    if (this.state.upc.length > 5) {
      this.searchStores(this.state.upc, null);
    }
  }

  componentWillMount() {
    if (this.state.upc.length > 5) {
      this.searchStores(this.state.upc, null);
    }

  }
  render() {
    return ( <div className = "App" >
      <img src={logo} className="App-logo" id="progressIcon" alt="logo" />


      <div className = "Entry" >
      <div>
      UPC: <input type = "text" value={this.state.upc} onChange={this.handleChange}/>
      <div>{this.state.progress} </div>
      <div width="100%">
        {
          Object.keys(this.state.product).map(key =>
            <div key={key}>
              <div width="200px">{key}</div><div>{this.state.product[key]}</div>
            </div>
          )
        }
      </div>
      <table border = "1px" >
      <tbody>
      {
        this.state.storePrices.map(storePrice =>

          <tr key={storePrice.no}>
            <td>{storePrice.no}</td>
            <td>{storePrice.price}</td>
            <td>{storePrice.stock}</td>
            <td>{storePrice.address}</td>
            <td>{storePrice.zip}</td>
          </tr>
        )
      }
      </tbody>
      </table>

      </div>

      </div>
      </div>
    );
  }
}

export default App;
