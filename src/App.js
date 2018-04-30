import React, {Component} from 'react';
import './App.css';
//import logo from './logo.svg';
const axios = require('axios');
const stores = require('./stores.json');
//===============
const secrets = require('./secrets.json');
const apiKey = secrets.apiKey;
const walmart = require('walmart')(apiKey);

const queryString = require('query-string');

let allStores = stores.allStores;
let failedStores = [];

const randomApiDomain = () => {
  let domains = ['walseek.herokuapp.com', 'walseek1.herokuapp.com', 'walseek2.herokuapp.com'];
  return domains[Math.floor(Math.random()*domains.length)];
}
const formatCurrency = (num) => {
  return '$' + Number.parseFloat(num).toFixed(2);
}
const saveSearch = (product) => {
  let url = 'https://walseek.herokuapp.com/products';
  //let url = 'http://localhost:3001/products';
  axios.post(url, product).catch(e => console.log('save search failed'));
}

// const getUPC = async (sku) => {
//   const apiKey = secrets.apiKey;
//   const url = `https://cors-anywhere.herokuapp.com/https://api.walmartlabs.com/v1/items/${sku}?apiKey=${apiKey}`;
//   let resp = await axios.get(url);
//   return resp.data.upc;
// };

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
      zip: '',
      storePrices: [],
      product: {},
      progress: 0,
      searches: [],
      showInstructions: false
    }

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.searchStores = this.searchStores.bind(this);
    this.searchHistory = this.searchHistory.bind(this);
    this.toggleInstructions = this.toggleInstructions.bind(this);
  }

  searchHistory = async () => {
    let url = 'https://walseek-rest.herokuapp.com/products?count=50';
    //let url = 'http://localhost:3001/products';
    let searches = [];
    axios.get(url).then(response => {
      if (response && response.data) {
        searches = response.data;
      }
      searches = searches.map(s => {
        let store = allStores.filter(store => store.zip === s.zip)[0];
        delete s.createdDate;
        delete s._id;
        delete s.__v;
        return {...s, storeId: store.no, address: store.address};
      });
      this.setState({searches});
    })
    .catch(e => {
      console.log('Cannot get recent searches', e);
    });
  }

  toggleInstructions = () => {
    this.setState({showInstructions: !this.state.showInstructions});
  }

  searchStores = async (upc, zip) => {
    let [numStores, storeCount, lowPrice, lowZip, numResults] = [100, 4683, 9999, 0, 10];
    if (zip) {
      storeCount = 100;
      numResults = 100;
    }

    if (!upc) {
      console.log('UPC not found');
      return;
    }
    let progress = 0;

    for (let i = 0; i< storeCount; i = i + numStores) {
      let url = `https://${randomApiDomain()}/stores-by-code/${upc}`;
      //let url = `http://localhost:3001/stores-by-code/${upc}`;
      axios.get(url, {
        params: {
          start: i,
          stores: numStores,
          zip: zip
        }
      })
      .then(resp => {
        if (resp.data.item && resp.data.item.sku && !this.state.product.sku) {
          this.setState({product: resp.data.item});
        }

        let storePrices = this.state.storePrices;
        resp.data.storePrices.map(s => {
          if (zip || s.price <= lowPrice){
          storePrices.unshift(s);
          [lowPrice, lowZip] = [s.price, s.zip];
        }
        });

        if (zip) {
          storePrices = storePrices.sort((a,b) => {
            return a.price - b.price;
          })
        }

        this.setState({storePrices: storePrices.slice(0,numResults)});
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});
        if (progress === 100) {
          let product = (({ name, sku}) => ({name, sku}))(this.state.product);
          product = {...product, price:lowPrice, zip: '00000'.concat(lowZip).slice(-5)};
          if (!zip && product && product.sku) {
            saveSearch(product);
          }
        }
      })
      .catch (e => {
        progress = Math.min(100, this.state.progress + numStores * 100 /storeCount);
        this.setState({progress});

        console.log('errored', progress, e);
      })
    }

  }

  handleChange(event) {
    this.setState({[event.target.name]: event.target.value});
  }

  handleSubmit(event) {
    this.setState({progress: 1, product: {}})
    if (this.state.upc.length > 3) {
      this.setState({storePrices: []});
      this.searchStores(this.state.upc, this.state.zip);
    }
    if (event) {
      event.preventDefault();
    }
  }

  componentDidMount() {
    //eslint-disable-next-line
    let upc = queryString.parseUrl(location.href).query.item;

    if (upc) {
      this.setState({upc: upc.slice(-12)});
      setTimeout(() => {
        this.handleSubmit();
      }, 1000 / 60);
    }

    this.searchHistory();
  }
  render() {
    const tableDisplay = (this.state.storePrices.length > 0 )?'table-row':'none';
    const productDisplay = (this.state.product && this.state.product.sku)? 'block': 'none';

    return ( <div className = "App" >
      <div className = "Entry" >
      <div>
      <div>
      <h2>Walmart nationwide low price search</h2>
      <button onClick={this.toggleInstructions.bind(this)}>Instructions to use it with a barcode app</button>
      <br/>
      Enter SKU or UPC. Enter zip for local search and Pickup Today info. <br/>
      *One search at a time. No multi-tab search please!*
      <br/>
      <div style={{textAlign:"left", marginLeft: "40%", display: this.state.showInstructions?"block":"none"}}>
        It's handy when you're at a store and want to know the lowest price.
        <ul>
          <li><a target="_blank" rel="noopener noreferrer" href="https://itunes.apple.com/us/app/barcode/id522354642">Install this iOS Barcode app</a></li>
          <li>Settings (Bottom right gear icon) -> Custom URL</li>
          <li>Prefix: https://vkana.github.io/walseek?item= </li>
          <li>Name: Walseek (or whatever)</li>
          <li><a target="_blank" rel="noopener noreferrer" href="https://play.google.com/store/apps/details?id=com.google.zxing.client.android">Similar app and setup for Android</a></li>
          <li>Goto app and scan a barcode, select Walseek!</li>
        </ul>

      </div>
      </div><br/>
      <form onSubmit={this.handleSubmit}>
        <label>SKU or UPC: </label>
        <input type = "text" name="upc" value={this.state.upc} onChange={this.handleChange}/>
        <label> ZIP: </label>
        <input type = "text" name="zip" value={this.state.zip} onChange={this.handleChange}/>
        <label> </label>
        <input disabled={this.state.progress > 0 && this.state.progress < 100} type="submit" value="Submit" />
      </form>

      <div id="progressbar">
      <div id="progress" style={{width:`${this.state.progress}%`}}>{this.state.progress >= 100 ? 'Done!': ''}</div>
      </div>
      <br/>


          <div style={{display:productDisplay}}>
          <div>Walmart: <a target="_blank" rel="noopener noreferrer" href={this.state.product.url}>{this.state.product.name}</a></div>
          <div>Brickseek: <a target="_blank" rel="noopener noreferrer" href={this.state.product.bsUrl}>{this.state.product.sku}</a></div>
          <div>UPC Barcode: <a target="_blank" rel="noopener noreferrer" href={`http://barcode.live/?upc=${this.state.product.upc}`}>{this.state.product.upc}</a></div>
          <div>Sold: {this.state.product.offerType}</div>
          </div>

<br/>
      <table align="center">

      <tbody>

      <tr style={{display: tableDisplay}}>
      <th>Store #</th><th>Address</th><th>ZIP</th><th className="right">Price</th><th>Stock</th><th>Pickup Today</th>
      </tr>
      {
        this.state.storePrices.map(storePrice =>

          <tr key={storePrice.no} className="alternate">
            <td><a target="_blank" rel="noopener noreferrer"
                href={`https://www.walmart.com/store/${storePrice.no}/search?query=${this.state.product.sku}`}>{storePrice.no}</a></td>
            <td>{storePrice.address}</td>
            <td>{storePrice.zip}</td>
            <td className="right">{formatCurrency(storePrice.price)}</td>
            <td>{storePrice.stock}</td>
            <td>{storePrice.pickupToday? 'Yes': 'No'}</td>
          </tr>
        )
      }
      </tbody>
      </table>
      <br/>
      <div>
      <h3>Recent searches</h3>
      <table className="alternate left-text" align="center" width="95%">
        <tbody>
          <tr><th>SKU</th><th>Name</th><th className="right-text">Price</th><th>Address</th></tr>
          {
            this.state.searches.map((s,idx) =>
              <tr key={idx}>
                <td width="10%"> <a target="_blank" rel="noopener noreferrer" href={`https://www.brickseek.com/walmart-inventory-checker?sku=${s.sku}`}>{s.sku}</a></td>
                <td width="55%">
                  {s.name} <a target="_blank" rel="noopener noreferrer" href={`https://www.walmart.com/store/${s.storeId}/search?query=${s.sku}`}>&#8599;</a>
                  &nbsp;<a target="_blank" rel="noopener noreferrer" href={`https://www.walmart.com/ip/${s.sku}`}>&#8594;</a>
                </td>
                <td width="10%" className="right-text">{formatCurrency(s.price)}</td>
                <td width="25%">#{s.storeId}, {s.address} {s.zip}</td>
              </tr>
            )
          }
        </tbody>
      </table>
      <br/>
      </div>
      </div>
      </div>
      </div>
    );
  }
}

export default App;
