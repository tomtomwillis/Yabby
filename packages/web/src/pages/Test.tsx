import Button from '../components/basic/Button';
import Star from '../components/basic/Star'; 
import UserMessage from '../components/basic/UserMessages';
import TextBox from '../components/basic/MessageTextBox';
import Header from '../components/basic/Header';
import '../App.css'; 
import '../components/basic/TextAnimations.css';
import Carousel from '../components/basic/Carousel';
import CarouselAlbums from '../components/CarouselAlbums';

function App() {
  const handleClick = () => {
    alert('Button clicked!');
  };

  return (
    <div className="app-container">
      <Header title="Welcome to YabbyVille" subtitle="We <3 you" />
      <Star />

      <Carousel
  loop
  autoplay
  autoplayDelay={3000}
  slides={[
    <img src="./Stickers/avatar_astro_blue.webp" alt="One" />,
    <img src="./Stickers/avatar_astro_red.webp" alt="Two" />,
    <img src="./Stickers/avatar_astro_pink.webp" alt="Three" />,
    <img src="./Stickers/avatar_charli_pink.webp" alt="Four" />,
    <img src="./Stickers/avatar_charli_green.webp" alt="Five" />,
    <img src="./Stickers/avatar_devilboy_blue.webp" alt="Six" />,
    <img src="./Stickers/avatar_devilboy_pink.webp" alt="Seven" />,
    <img src="./Stickers/avatar_devilboy_red.webp" alt="Eight" />,
    <img src="./Stickers/avatar_astro_green.webp" alt="Nine" />,
  ]}
/>

        <CarouselAlbums />

      <h1 className="title1 animated-text drift-circular pause-on-hover">YabbyVille</h1>

      <h1 className="links">links</h1>
      
      <h1 className="normal-text">testing the normal text</h1>

      <Button label="Sign In" onClick={handleClick} />
      <Button type='close' onClick={handleClick} className="custom-close-button" />
      <Button type='arrow-left' onClick={handleClick} className="custom-arrow-button" />
      <Button type='arrow-right' onClick={handleClick} className="custom-arrow-button" />
      
      <TextBox
        placeholder="Type your message here..."
        onSend={(text) => console.log('Sent:', text)}
        maxWords={250}
        disabled={false}
      />

      <TextBox
        placeholder="Email"
        onSend={(text) => console.log('Email entered:', text)}
        maxWords={250}
        disabled={false}
        showSendButton={false}
      />

      <UserMessage 
        username="bumblebee"
        message="Your message here, testing the word wrapping and layout."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_astro_blue.webp"
        onClose={() => console.log('Message closed')}
      />

      <UserMessage 
        username="testing out a longer name here"
        message="Looking at your code, the issue is that the flex properties aren't properly handling the content height on mobile devices. The main problem is in the .user-message-text class where flex: none is removing the flexible behavior, but the container isn't properly adjusting."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_devilboy_pink.webp"
        onClose={() => console.log('Message closed')}
      />

      <UserMessage 
        username="testing out a longer name here"
        message="Looking at your code, the issue is that the flex properties aren't properly handling the content height on mobile devices. The main problem is in the .user-message-text class where flex: none is removing the flexible behavior, but the container isn't properly adjusting."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_charli_green.webp"
        onClose={() => console.log('Message closed')}
      />
    </div>
  );
}

export default App;